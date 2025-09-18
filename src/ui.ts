import { App, Modal, Setting, Notice } from 'obsidian';

export class PageIdModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;
    lastPageId: string;

    constructor(app: App, lastPageId: string, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.lastPageId = lastPageId;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Upload to Confluence' });

        new Setting(contentEl)
            .setName('Page ID')
            .setDesc('Enter the Confluence page ID to update')
            .addText((text) => {
                text.setPlaceholder('e.g., 123456789')
                    .setValue(this.lastPageId)
                    .onChange((value) => {
                        this.result = value;
                    });

                // Set initial value
                this.result = this.lastPageId;

                // Focus and select the text
                setTimeout(() => {
                    text.inputEl.focus();
                    text.inputEl.select();
                }, 10);

                // Handle Enter key
                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter' && this.result) {
                        e.preventDefault();
                        this.close();
                        this.onSubmit(this.result);
                    }
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.close();
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText('Upload')
                    .setCta()
                    .onClick(() => {
                        if (this.result) {
                            this.close();
                            this.onSubmit(this.result);
                        } else {
                            new Notice('Please enter a page ID');
                        }
                    }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class CreatePageModal extends Modal {
    spaceKey: string = '';
    title: string = '';
    parentId: string = '';
    onSubmit: (spaceKey: string, title: string, parentId?: string) => void;

    constructor(
        app: App,
        defaultSpaceKey: string,
        defaultTitle: string,
        onSubmit: (spaceKey: string, title: string, parentId?: string) => void
    ) {
        super(app);
        this.onSubmit = onSubmit;
        this.spaceKey = defaultSpaceKey;
        this.title = defaultTitle;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Create New Confluence Page' });

        new Setting(contentEl)
            .setName('Space Key')
            .setDesc('The Confluence space key (e.g., TEAM)')
            .addText((text) => {
                text.setPlaceholder('e.g., TEAM')
                    .setValue(this.spaceKey)
                    .onChange((value) => {
                        this.spaceKey = value;
                    });

                setTimeout(() => {
                    text.inputEl.focus();
                }, 10);
            });

        new Setting(contentEl)
            .setName('Page Title')
            .setDesc('The title for the new page')
            .addText((text) => {
                text.setPlaceholder('Page title')
                    .setValue(this.title)
                    .onChange((value) => {
                        this.title = value;
                    });
            });

        new Setting(contentEl)
            .setName('Parent Page ID')
            .setDesc('Optional: ID of the parent page')
            .addText((text) => {
                text.setPlaceholder('Optional: parent page ID')
                    .setValue(this.parentId)
                    .onChange((value) => {
                        this.parentId = value;
                    });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.close();
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText('Create & Upload')
                    .setCta()
                    .onClick(() => {
                        if (!this.spaceKey || !this.title) {
                            new Notice('Space key and title are required');
                            return;
                        }
                        this.close();
                        this.onSubmit(
                            this.spaceKey,
                            this.title,
                            this.parentId || undefined
                        );
                    }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class ProgressModal extends Modal {
    message: string;

    constructor(app: App, message: string) {
        super(app);
        this.message = message;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.empty();
        contentEl.createEl('h3', { text: this.message });

        const progressContainer = contentEl.createDiv({ cls: 'confluence-upload-progress' });
        progressContainer.createEl('div', {
            cls: 'confluence-upload-spinner',
            text: '⏳'
        });
    }

    updateMessage(message: string) {
        this.message = message;
        const { contentEl } = this;
        const heading = contentEl.querySelector('h3');
        if (heading) {
            heading.textContent = message;
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}