export class MarkdownToConfluenceConverter {
    private codeBlockCounter = 0;
    private codeBlocks: Map<string, string> = new Map();

    convert(markdown: string): string {
        this.codeBlockCounter = 0;
        this.codeBlocks.clear();

        let processed = markdown;

        // Step 1: Extract and preserve code blocks (both fenced and inline)
        processed = this.extractCodeBlocks(processed);

        // Step 2: Convert Markdown elements to Confluence XHTML
        processed = this.convertMarkdownToConfluence(processed);

        // Step 3: Restore code blocks with proper Confluence formatting
        processed = this.restoreCodeBlocks(processed);

        return processed;
    }

    private extractCodeBlocks(content: string): string {
        // Extract fenced code blocks first
        content = content.replace(
            /```(\w*)\n([\s\S]*?)```/g,
            (match, lang, code) => {
                const placeholder = this.createCodeBlockPlaceholder();
                const confluenceBlock = this.createConfluenceCodeBlock(lang || 'text', code);
                this.codeBlocks.set(placeholder, confluenceBlock);
                return placeholder;
            }
        );

        // Extract inline code
        content = content.replace(
            /`([^`\n]+)`/g,
            (match, code) => {
                const placeholder = this.createCodeBlockPlaceholder();
                this.codeBlocks.set(placeholder, `<code>${this.escapeHtml(code)}</code>`);
                return placeholder;
            }
        );

        return content;
    }

    private createCodeBlockPlaceholder(): string {
        return `__CODEBLOCK_${this.codeBlockCounter++}__`;
    }

    private createConfluenceCodeBlock(language: string, content: string): string {
        // Map common language aliases to Confluence-supported languages
        const languageMap: Record<string, string> = {
            'js': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'jsx': 'javascript',
            'bash': 'bash',
            'shell': 'bash',
            'sh': 'bash',
            'py': 'python',
            'yml': 'yaml',
            'json': 'javascript',
            'xml': 'xml',
            'html': 'html',
            'css': 'css',
            'sql': 'sql',
            'java': 'java',
            'c': 'c',
            'cpp': 'cpp',
            'c++': 'cpp',
            'cs': 'csharp',
            'c#': 'csharp',
            'go': 'go',
            'rust': 'rust',
            'ruby': 'ruby',
            'rb': 'ruby',
            'php': 'php',
            'swift': 'swift',
            'kotlin': 'kotlin',
            'r': 'r',
            'matlab': 'matlab',
            'scala': 'scala',
            'perl': 'perl',
            'lua': 'lua',
            'haskell': 'haskell',
            'clojure': 'clojure',
            'groovy': 'groovy',
            'powershell': 'powershell',
            'ps1': 'powershell',
            'dockerfile': 'docker',
            'makefile': 'makefile',
            'nginx': 'nginx',
            'apache': 'apache',
            'ini': 'ini',
            'toml': 'toml',
            'properties': 'properties',
            'diff': 'diff',
            'patch': 'diff'
        };

        const mappedLanguage = languageMap[language.toLowerCase()] || language || 'text';

        // CRITICAL: Use CDATA to preserve content exactly as-is
        // This prevents XML parsing issues with generics like Map<String, Object>
        return `<ac:structured-macro ac:name="code">
<ac:parameter ac:name="language">${mappedLanguage}</ac:parameter>
<ac:parameter ac:name="linenumbers">true</ac:parameter>
<ac:plain-text-body><![CDATA[${content}]]></ac:plain-text-body>
</ac:structured-macro>`;
    }

    private convertMarkdownToConfluence(content: string): string {
        // Convert headings (must be done before other conversions)
        content = content.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
        content = content.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
        content = content.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
        content = content.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
        content = content.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
        content = content.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

        // Convert bold and italic (order matters - bold first)
        content = content.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/\*(.+?)\*/g, '<em>$1</em>');
        content = content.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
        content = content.replace(/__(.+?)__/g, '<strong>$1</strong>');
        content = content.replace(/_(.+?)_/g, '<em>$1</em>');

        // Convert strikethrough
        content = content.replace(/~~(.+?)~~/g, '<del>$1</del>');

        // Convert links
        content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        // Convert images
        content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<ac:image><ri:url ri:value="$2" /></ac:image>');

        // Convert horizontal rules
        content = content.replace(/^---+$/gm, '<hr />');
        content = content.replace(/^\*\*\*+$/gm, '<hr />');

        // Convert blockquotes
        content = content.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

        // Convert lists
        content = this.convertLists(content);

        // Convert tables
        content = this.convertTables(content);

        // Convert line breaks (must be done last)
        content = content.replace(/\n\n+/g, '</p><p>');
        content = content.replace(/\n/g, '<br />');

        // Wrap in paragraphs if needed
        if (!content.startsWith('<')) {
            content = '<p>' + content + '</p>';
        }

        // Clean up empty paragraphs
        content = content.replace(/<p><\/p>/g, '');
        content = content.replace(/<p>(<h[1-6]>)/g, '$1');
        content = content.replace(/(<\/h[1-6]>)<\/p>/g, '$1');

        return content;
    }

    private convertLists(content: string): string {
        const lines = content.split('\n');
        const result: string[] = [];
        const listStack: Array<{ type: 'ul' | 'ol', indent: number }> = [];

        for (const line of lines) {
            const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
            const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

            if (unorderedMatch) {
                const [, spaces, text] = unorderedMatch;
                const indent = spaces.length;
                this.handleListItem(result, listStack, 'ul', indent, text);
            } else if (orderedMatch) {
                const [, spaces, , text] = orderedMatch;
                const indent = spaces.length;
                this.handleListItem(result, listStack, 'ol', indent, text);
            } else {
                // Close all open lists
                while (listStack.length > 0) {
                    const list = listStack.pop()!;
                    result.push(`</${list.type}>`);
                }
                result.push(line);
            }
        }

        // Close remaining lists
        while (listStack.length > 0) {
            const list = listStack.pop()!;
            result.push(`</${list.type}>`);
        }

        return result.join('\n');
    }

    private handleListItem(
        result: string[],
        listStack: Array<{ type: 'ul' | 'ol', indent: number }>,
        type: 'ul' | 'ol',
        indent: number,
        text: string
    ): void {
        // Close lists that are deeper than current indent
        while (listStack.length > 0 && listStack[listStack.length - 1].indent > indent) {
            const list = listStack.pop()!;
            result.push(`</${list.type}>`);
        }

        // Open new list if needed
        if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
            result.push(`<${type}>`);
            listStack.push({ type, indent });
        } else if (listStack[listStack.length - 1].type !== type) {
            // Switch list type
            const oldList = listStack.pop()!;
            result.push(`</${oldList.type}>`);
            result.push(`<${type}>`);
            listStack.push({ type, indent });
        }

        result.push(`<li>${text}</li>`);
    }

    private convertTables(content: string): string {
        const lines = content.split('\n');
        const result: string[] = [];
        let inTable = false;
        let headerRow = true;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.match(/^\|.*\|$/)) {
                // Check if next line is separator
                if (i + 1 < lines.length && lines[i + 1].match(/^\|[\s-:|]+\|$/)) {
                    // Start of table with header
                    if (!inTable) {
                        result.push('<table>');
                        result.push('<thead>');
                        inTable = true;
                        headerRow = true;
                    }

                    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
                    result.push('<tr>');
                    cells.forEach(cell => result.push(`<th>${cell}</th>`));
                    result.push('</tr>');

                    i++; // Skip separator line
                    result.push('</thead>');
                    result.push('<tbody>');
                    headerRow = false;
                } else if (inTable) {
                    // Regular table row
                    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
                    result.push('<tr>');
                    cells.forEach(cell => result.push(`<td>${cell}</td>`));
                    result.push('</tr>');
                } else {
                    // Not a table, just a line with pipes
                    result.push(line);
                }
            } else {
                if (inTable) {
                    result.push('</tbody>');
                    result.push('</table>');
                    inTable = false;
                    headerRow = true;
                }
                result.push(line);
            }
        }

        if (inTable) {
            result.push('</tbody>');
            result.push('</table>');
        }

        return result.join('\n');
    }

    private escapeGenerics(content: string): string {
        // Skip escaping - Confluence handles this internally
        // The issue was that we were escaping HTML tags that we just created
        return content;
    }

    private escapeHtml(text: string): string {
        const escapeMap: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };

        return text.replace(/[&<>"']/g, char => escapeMap[char]);
    }

    private restoreCodeBlocks(content: string): string {
        this.codeBlocks.forEach((block, placeholder) => {
            content = content.replace(placeholder, block);
        });
        return content;
    }
}