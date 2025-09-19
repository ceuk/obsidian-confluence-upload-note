import { marked, Tokens } from 'marked';
import { MermaidRenderer } from './mermaidRenderer';

export class SimpleConfluenceConverter {
    private mermaidRenderer: MermaidRenderer | null = null;
    private enableMermaid = true;

    constructor(enableMermaid = true) {
        this.enableMermaid = enableMermaid;
        if (enableMermaid) {
            this.mermaidRenderer = new MermaidRenderer();
        }

        // Only override the specific things we need for Confluence
        const renderer = new marked.Renderer();

        // Override code blocks for Confluence format with CDATA
        // In marked v16+, the renderer receives a token object, not strings directly
        renderer.code = function(token: Tokens.Code): string {
            // Extract the actual code text and language from the token
            const code = token.text || token.raw || '';
            const lang = token.lang || 'text';

            // Skip mermaid blocks here - they'll be handled separately
            if (lang.toLowerCase() === 'mermaid') {
                // Return a placeholder that won't be processed by marked
                // Using HTML comments to prevent markdown processing
                return `<!--MERMAID_BLOCK_PLACEHOLDER_START-->${code}<!--MERMAID_BLOCK_PLACEHOLDER_END-->`;
            }

            // Map common language aliases
            const languageMap: Record<string, string> = {
                'js': 'javascript',
                'ts': 'typescript',
                'tsx': 'typescript',
                'jsx': 'javascript',
                'py': 'python',
                'yml': 'yaml',
                'yaml': 'yaml',
                'sh': 'bash',
                'shell': 'bash',
                'bash': 'bash',
                'json': 'javascript',
                'xml': 'xml',
                'html': 'html',
                'css': 'css',
                'sql': 'sql',
                'java': 'java'
            };

            const mappedLang = languageMap[lang.toLowerCase()] || lang;

            // Use CDATA to preserve code exactly as-is
            return `<ac:structured-macro ac:name="code">
<ac:parameter ac:name="language">${mappedLang}</ac:parameter>
<ac:parameter ac:name="linenumbers">true</ac:parameter>
<ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>`;
        };

        // Override inline code rendering
        // In marked v16+, the renderer receives a token object
        renderer.codespan = function(token: Tokens.Codespan): string {
            const text = token.text || token.raw || '';
            return `<code>${text}</code>`;
        };

        // Override HR (horizontal rule) rendering to ensure self-closing tag
        renderer.hr = function(): string {
            // MUST be self-closing for XHTML/Confluence
            return '<hr/>';
        };

        // Override BR (line break) rendering to ensure self-closing tag
        renderer.br = function(): string {
            // MUST be self-closing for XHTML/Confluence
            return '<br/>';
        };

        // Override image rendering for Confluence
        // In marked v16+, the renderer receives a token object
        renderer.image = function(token: Tokens.Image): string {
            const href = token.href || '';
            return `<ac:image><ri:url ri:value="${href}" /></ac:image>`;
        };

        // Override list item rendering to fix task list checkboxes
        renderer.listitem = function(token: Tokens.ListItem): string {
            // Parse inline tokens (like **bold**, *italic*, etc.) in the list item
            let text = '';
            if (token.tokens && token.tokens.length > 0) {
                // Use the parser to process inline tokens
                text = this.parser.parseInline(token.tokens);
            } else {
                text = token.text || '';
            }

            const task = token.task;
            const checked = token.checked;

            if (task) {
                // For task lists, ensure the checkbox is self-closing
                const checkbox = checked
                    ? '<input type="checkbox" checked="checked" disabled="disabled" />'
                    : '<input type="checkbox" disabled="disabled" />';
                text = checkbox + ' ' + text;
            }

            return '<li>' + text + '</li>\n';
        };

        // Configure marked with our custom renderer
        marked.setOptions({
            renderer: renderer,
            gfm: true, // GitHub Flavored Markdown
            breaks: true, // Convert \n to <br>
            pedantic: false,
            smartLists: true,
            smartypants: false
        });
    }

    async convert(markdown: string): Promise<{ html: string; mermaidData: Array<{ index: number; svg: string | null; code: string }> | null }> {
        try {

            let processedMarkdown = markdown;
            let mermaidData: Array<{ index: number; svg: string | null; code: string }> | null = null;

            // Process mermaid blocks first if enabled
            if (this.enableMermaid && this.mermaidRenderer) {
                const result = await this.mermaidRenderer.processMermaidBlocks(markdown);
                processedMarkdown = result.markdown;
                mermaidData = result.mermaidData;
            }

            // Let marked do most of the work with its default renderer
            // We only override code blocks and images
            let html = marked.parse(processedMarkdown);

            // Also handle any mermaid blocks that were processed by marked
            // (in case they got through as code blocks)
            const mermaidPlaceholderRegex = /<!--MERMAID_BLOCK_PLACEHOLDER_START-->([\s\S]*?)<!--MERMAID_BLOCK_PLACEHOLDER_END-->/g;
            html = html.replace(mermaidPlaceholderRegex, (match, code) => {
                // This shouldn't happen if mermaid processing worked, but as a fallback
                return `<pre><code>mermaid\n${code}</code></pre>`;
            });


            // Clean up any XHTML issues for Confluence
            let cleaned = String(html).trim();

            // Ensure all self-closing tags are properly formatted for XHTML
            cleaned = cleaned
                // Fix HR tags - must be self-closing
                .replace(/<hr\s*>/gi, '<hr/>')
                .replace(/<hr\s*\/\s*>/gi, '<hr/>')
                // Fix BR tags - must be self-closing
                .replace(/<br\s*>/gi, '<br/>')
                .replace(/<br\s*\/\s*>/gi, '<br/>')
                // Fix IMG tags - must be self-closing
                .replace(/<img([^>]+)(?<!\/)\s*>/gi, '<img$1/>')
                // Remove any stray </hr> or </br> closing tags (invalid in XHTML)
                .replace(/<\/hr>/gi, '')
                .replace(/<\/br>/gi, '');


            return { html: cleaned, mermaidData };
        } catch (error) {
            console.error('Markdown conversion error:', error);
            // Fallback to basic conversion if marked fails
            return {
                html: `<p>${markdown.replace(/\n/g, '<br />')}</p>`,
                mermaidData: null
            };
        }
    }

    getMermaidRenderer(): MermaidRenderer | null {
        return this.mermaidRenderer;
    }
}