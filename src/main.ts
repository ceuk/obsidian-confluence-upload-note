import { Plugin, MarkdownView, Notice, TFile, Menu, MenuItem } from 'obsidian';
import { ConfluenceSettingTab, DEFAULT_SETTINGS } from './settings';
import { ConfluenceSettings } from './types';
import { ConfluenceAPI } from './confluenceApi';
import { SimpleConfluenceConverter } from './simpleConverter';
import { PageIdModal, CreatePageModal, ProgressModal } from './ui';

export default class ConfluenceUploadPlugin extends Plugin {
    settings: ConfluenceSettings;
    api: ConfluenceAPI;
    converter: SimpleConfluenceConverter;

    async onload() {
        await this.loadSettings();

        this.api = new ConfluenceAPI(this.settings);
        this.converter = new SimpleConfluenceConverter(this.settings.enableMermaid);

        // Add command to upload current note
        this.addCommand({
            id: 'upload-current-note',
            name: 'Upload current note to Confluence',
            callback: () => this.uploadCurrentNote()
        });

        // Add command to create new page
        this.addCommand({
            id: 'create-confluence-page',
            name: 'Create new Confluence page from current note',
            callback: () => this.createNewPage()
        });

        // Add ribbon icon
        this.addRibbonIcon('upload-cloud', 'Upload to Confluence', (evt: MouseEvent) => {
            this.uploadCurrentNote();
        });

        // Add settings tab
        this.addSettingTab(new ConfluenceSettingTab(this.app, this));

        // Add context menu item
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
                if (file.extension === 'md') {
                    menu.addItem((item: MenuItem) => {
                        item
                            .setTitle('Upload to Confluence')
                            .setIcon('upload-cloud')
                            .onClick(async () => {
                                const content = await this.app.vault.read(file);
                                this.uploadContent(content, file.basename);
                            });
                    });
                }
            })
        );

    }

    onunload() {
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update API instance with new settings
        this.api = new ConfluenceAPI(this.settings);
        // Update converter with new mermaid setting
        this.converter = new SimpleConfluenceConverter(this.settings.enableMermaid);
    }

    async uploadCurrentNote() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('❌ No active note to upload');
            return;
        }

        const content = activeView.getViewData();
        const title = activeView.file?.basename || 'Untitled';

        await this.uploadContent(content, title);
    }

    async uploadContent(markdownContent: string, title: string) {
        if (!this.settings.apiToken && !this.settings.useEnvironmentToken) {
            new Notice('❌ API token not configured. Please check settings.');
            return;
        }

        if (!this.settings.baseUrl) {
            new Notice('❌ Base URL not configured. Please check settings.');
            return;
        }

        const modal = new PageIdModal(
            this.app,
            this.settings.lastPageId,
            async (pageId) => {
                await this.performUpload(pageId, markdownContent, title);
            }
        );
        modal.open();
    }

    async createNewPage() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('❌ No active note to upload');
            return;
        }

        const content = activeView.getViewData();
        const defaultTitle = activeView.file?.basename || 'Untitled';

        const modal = new CreatePageModal(
            this.app,
            this.settings.defaultSpaceKey,
            defaultTitle,
            async (spaceKey, title, parentId) => {
                await this.performCreate(spaceKey, title, content, parentId);
            }
        );
        modal.open();
    }

    async performUpload(pageId: string, markdownContent: string, title: string) {
        const progressModal = new ProgressModal(this.app, 'Converting markdown...');
        progressModal.open();

        try {

            // Convert markdown to Confluence XHTML
            progressModal.updateMessage('Converting markdown to Confluence format...');
            const { html, mermaidData } = await this.converter.convert(markdownContent);


            let finalHtml = html;

            // Handle mermaid diagrams if any
            if (mermaidData && mermaidData.length > 0) {
                progressModal.updateMessage('Processing Mermaid diagrams...');

                // First, upload the page with placeholders
                progressModal.updateMessage('Uploading to Confluence...');
                await this.api.updatePage(pageId, finalHtml);

                // Then upload mermaid diagrams as attachments
                const mermaidRenderer = this.converter.getMermaidRenderer();
                if (mermaidRenderer) {
                    for (const item of mermaidData) {
                        if (item.svg) {
                            try {
                                progressModal.updateMessage(`Uploading Mermaid diagram ${item.index + 1}...`);
                                const filename = `mermaid-${item.index}.svg`;
                                await this.api.uploadAttachment(pageId, filename, item.svg, 'image/svg+xml');

                                // Replace placeholder with attachment reference
                                const attachmentMarkup = mermaidRenderer.generateConfluenceMarkup(filename, item.code);
                                finalHtml = finalHtml.replace(
                                    `<!--MERMAID_PLACEHOLDER_${item.index}-->`,
                                    attachmentMarkup
                                );
                            } catch (attachError: unknown) {
                                console.error('===== MERMAID ATTACHMENT UPLOAD ERROR =====');
                                console.error(`Failed to upload mermaid diagram ${item.index}`);
                                console.error('Error:', attachError);
                                const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
                                const errorStack = attachError instanceof Error ? attachError.stack : undefined;
                                console.error('Error message:', errorMessage);
                                if (errorStack) console.error('Error stack:', errorStack);

                                // If it's a 403, provide more context
                                if (errorMessage.includes('403')) {
                                    console.error('403 Forbidden: This usually means:');
                                    console.error('- You don\'t have permission to add attachments to this page');
                                    console.error('- The page might be restricted');
                                    console.error('- Your user might not have attachment permissions');
                                    console.error('Page ID:', pageId);
                                    console.error('Filename:', `mermaid-${item.index}.svg`);
                                }
                                console.error('===== END ERROR =====');

                                // Replace with code block fallback
                                const fallbackMarkup = mermaidRenderer.generateConfluenceMarkup(null, item.code);
                                finalHtml = finalHtml.replace(
                                    `<!--MERMAID_PLACEHOLDER_${item.index}-->`,
                                    fallbackMarkup
                                );
                            }
                        } else {
                            // No SVG, use code block
                            const fallbackMarkup = mermaidRenderer.generateConfluenceMarkup(null, item.code);
                            finalHtml = finalHtml.replace(
                                `<!--MERMAID_PLACEHOLDER_${item.index}-->`,
                                fallbackMarkup
                            );
                        }
                    }

                    // Update page with attachment references
                    progressModal.updateMessage('Updating page with diagrams...');
                    await this.api.updatePage(pageId, finalHtml);
                }
            } else {
                // No mermaid diagrams, just upload as is
                progressModal.updateMessage('Uploading to Confluence...');
                await this.api.updatePage(pageId, finalHtml);
            }

            // Save the page ID for future use
            this.settings.lastPageId = pageId;
            await this.saveSettings();

            progressModal.close();

            // Show success with link
            const pageUrl = this.api.getPageUrl(pageId);
            new Notice(`✅ Page updated successfully!`);

            // Copy URL to clipboard
            await navigator.clipboard.writeText(pageUrl);
            new Notice('📋 Page URL copied to clipboard');

        } catch (error) {
            progressModal.close();
            console.error('Upload error:', error);
            new Notice(`❌ Upload failed: ${error.message || 'Unknown error'}`);
        }
    }

    async performCreate(spaceKey: string, title: string, markdownContent: string, parentId?: string) {
        const progressModal = new ProgressModal(this.app, 'Creating page...');
        progressModal.open();

        try {
            // Convert markdown to Confluence XHTML
            progressModal.updateMessage('Converting markdown to Confluence format...');
            const { html, mermaidData } = await this.converter.convert(markdownContent);

            let finalHtml = html;

            // For now, create with placeholders - we'll add attachments after
            // (We need the page to exist before we can add attachments)

            // Create page in Confluence
            progressModal.updateMessage('Creating page in Confluence...');
            const pageId = await this.api.createPage(spaceKey, title, finalHtml, parentId);

            // Handle mermaid diagrams if any
            if (mermaidData && mermaidData.length > 0) {
                progressModal.updateMessage('Processing Mermaid diagrams...');

                const mermaidRenderer = this.converter.getMermaidRenderer();
                if (mermaidRenderer) {
                    for (const item of mermaidData) {
                        if (item.svg) {
                            try {
                                progressModal.updateMessage(`Uploading Mermaid diagram ${item.index + 1}...`);
                                const filename = `mermaid-${item.index}.svg`;
                                await this.api.uploadAttachment(pageId, filename, item.svg, 'image/svg+xml');

                                // Replace placeholder with attachment reference
                                const attachmentMarkup = mermaidRenderer.generateConfluenceMarkup(filename, item.code);
                                finalHtml = finalHtml.replace(
                                    `<!--MERMAID_PLACEHOLDER_${item.index}-->`,
                                    attachmentMarkup
                                );
                            } catch (attachError: unknown) {
                                console.error('===== MERMAID ATTACHMENT UPLOAD ERROR =====');
                                console.error(`Failed to upload mermaid diagram ${item.index}`);
                                console.error('Error:', attachError);
                                const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
                                const errorStack = attachError instanceof Error ? attachError.stack : undefined;
                                console.error('Error message:', errorMessage);
                                if (errorStack) console.error('Error stack:', errorStack);

                                // If it's a 403, provide more context
                                if (errorMessage.includes('403')) {
                                    console.error('403 Forbidden: This usually means:');
                                    console.error('- You don\'t have permission to add attachments to this page');
                                    console.error('- The page might be restricted');
                                    console.error('- Your user might not have attachment permissions');
                                    console.error('Page ID:', pageId);
                                    console.error('Filename:', `mermaid-${item.index}.svg`);
                                }
                                console.error('===== END ERROR =====');

                                // Replace with code block fallback
                                const fallbackMarkup = mermaidRenderer.generateConfluenceMarkup(null, item.code);
                                finalHtml = finalHtml.replace(
                                    `<!--MERMAID_PLACEHOLDER_${item.index}-->`,
                                    fallbackMarkup
                                );
                            }
                        } else {
                            // No SVG, use code block
                            const fallbackMarkup = mermaidRenderer.generateConfluenceMarkup(null, item.code);
                            finalHtml = finalHtml.replace(
                                `<!--MERMAID_PLACEHOLDER_${item.index}-->`,
                                fallbackMarkup
                            );
                        }
                    }

                    // Update page with attachment references
                    progressModal.updateMessage('Updating page with diagrams...');
                    await this.api.updatePage(pageId, finalHtml);
                }
            }

            // Save settings
            this.settings.lastPageId = pageId;
            this.settings.defaultSpaceKey = spaceKey;
            await this.saveSettings();

            progressModal.close();

            // Show success with link
            const pageUrl = this.api.getPageUrl(pageId);
            new Notice(`✅ Page created successfully!`);

            // Copy URL to clipboard
            await navigator.clipboard.writeText(pageUrl);
            new Notice('📋 Page URL copied to clipboard');

        } catch (error) {
            progressModal.close();
            console.error('Create error:', error);
            new Notice(`❌ Failed to create page: ${error.message || 'Unknown error'}`);
        }
    }
}