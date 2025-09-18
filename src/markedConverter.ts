import { marked } from 'marked';

// Custom renderer for Confluence Storage Format
const confluenceRenderer: Partial<marked.RendererObject> = {
    // Override heading rendering
    heading({ text, depth }) {
        return `<h${depth}>${text}</h${depth}>`;
    },

    // Override paragraph rendering
    paragraph({ text }) {
        return `<p>${text}</p>`;
    },

    // Override strong (bold) rendering
    strong({ text }) {
        return `<strong>${text}</strong>`;
    },

    // Override emphasis (italic) rendering
    em({ text }) {
        return `<em>${text}</em>`;
    },

    // Override strikethrough rendering
    del({ text }) {
        return `<del>${text}</del>`;
    },

    // Override code block rendering - CRITICAL for preserving generics
    code({ text, lang }) {
        const language = lang || 'text';

        // Map common language aliases
        const languageMap: Record<string, string> = {
            'js': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'jsx': 'javascript',
            'py': 'python',
            'yml': 'yaml',
            'sh': 'bash',
            'shell': 'bash'
        };

        const mappedLang = languageMap[language.toLowerCase()] || language;

        // Use CDATA to preserve code exactly as-is
        return `<ac:structured-macro ac:name="code">
<ac:parameter ac:name="language">${mappedLang}</ac:parameter>
<ac:parameter ac:name="linenumbers">true</ac:parameter>
<ac:plain-text-body><![CDATA[${text}]]></ac:plain-text-body>
</ac:structured-macro>`;
    },

    // Override inline code rendering
    codespan({ text }) {
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        return `<code>${escaped}</code>`;
    },

    // Override blockquote rendering
    blockquote({ text }) {
        return `<blockquote>${text}</blockquote>`;
    },

    // Override list rendering
    list(token) {
        const tag = token.ordered ? 'ol' : 'ul';
        // items is a string containing all the list items already rendered
        const body = token.items || '';
        return `<${tag}>${body}</${tag}>`;
    },

    // Override list item rendering
    listitem(token) {
        // text contains the already-rendered content
        return `<li>${token.text || ''}</li>`;
    },

    // Override table rendering
    table(token) {
        // For tables, header and rows are strings, not arrays
        const headerContent = token.header || '';
        const bodyContent = token.rows || '';

        return `<table>
<thead>${headerContent}</thead>
<tbody>${bodyContent}</tbody>
</table>`;
    },

    // Override table row rendering
    tablerow(token) {
        return `<tr>${token.text || ''}</tr>`;
    },

    // Override table cell rendering
    tablecell(token) {
        const tag = token.header ? 'th' : 'td';
        const alignAttr = token.align ? ` align="${token.align}"` : '';
        return `<${tag}${alignAttr}>${token.text || ''}</${tag}>`;
    },

    // Override link rendering
    link({ href, title, text }) {
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}"${titleAttr}>${text}</a>`;
    },

    // Override image rendering
    image({ href, title, text }) {
        // Use Confluence's image macro
        return `<ac:image><ri:url ri:value="${href}" /></ac:image>`;
    },

    // Override horizontal rule rendering
    hr() {
        return '<hr />';
    },

    // Override line break rendering
    br() {
        return '<br />';
    },

    // Override HTML rendering (pass through)
    html({ text }) {
        return text;
    }
};

export class MarkedConfluenceConverter {
    constructor() {
        // Configure marked with our custom renderer
        marked.use({
            renderer: confluenceRenderer,
            gfm: true, // GitHub Flavored Markdown
            breaks: true, // Convert \n to <br>
            pedantic: false,
            smartLists: true,
            smartypants: false
        });
    }

    convert(markdown: string): string {
        try {
            console.log('Input markdown:', markdown);

            // Process the markdown with our custom renderer
            // marked.parse returns a string in v16+
            const html = marked.parse(markdown) as string;

            console.log('Output HTML:', html);

            // Clean up any double line breaks that might cause issues
            let cleaned = html
                .replace(/\n\s*\n/g, '\n') // Remove empty lines
                .trim();

            return cleaned;
        } catch (error) {
            console.error('Markdown conversion error:', error);
            // Fallback to basic conversion if marked fails
            return `<p>${markdown.replace(/\n/g, '<br />')}</p>`;
        }
    }
}