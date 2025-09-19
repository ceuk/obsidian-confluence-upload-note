import mermaid from 'mermaid';

export class MermaidRenderer {
    private initialized = false;
    private renderCounter = 0;

    constructor() {
        this.initialize();
    }

    private initialize() {
        if (this.initialized) return;

        // Configure mermaid with settings optimized for Confluence
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            themeVariables: {
                primaryColor: '#fff',
                primaryTextColor: '#000',
                primaryBorderColor: '#7C7C7C',
                lineColor: '#5C5C5C',
                background: '#fff',
                mainBkg: '#f4f4f4',
                secondBkg: '#f4f4f4',
                tertiaryColor: '#fff'
            },
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true,
                curve: 'basis'
            },
            sequence: {
                useMaxWidth: true,
                diagramMarginX: 50,
                diagramMarginY: 10,
                actorMargin: 50,
                width: 150,
                height: 65,
                boxMargin: 10,
                boxTextMargin: 5,
                noteMargin: 10,
                messageMargin: 35
            },
            gantt: {
                useMaxWidth: true
            },
            securityLevel: 'loose', // Allow rendering in Obsidian context
            suppressErrorRendering: false
        });

        this.initialized = true;
    }

    /**
     * Render a mermaid diagram to SVG
     * @param code The mermaid diagram code
     * @returns The SVG string or null if rendering fails
     */
    async renderToSvg(code: string): Promise<string | null> {
        try {

            // Ensure mermaid is initialized
            if (!this.initialized) {
                this.initialize();
            }

            // Check if document is available
            if (typeof document === 'undefined') {
                console.error('Document is not available - cannot render mermaid');
                return null;
            }

            // Generate a unique ID for this render
            const id = `mermaid-diagram-${Date.now()}-${this.renderCounter++}`;

            // Create a visible container for rendering (hidden containers can cause getBBox issues)
            const container = document.createElement('div');
            container.id = id;
            container.addClass('mermaid-render-container');

            // Add to body
            document.body.appendChild(container);

            try {

                // Try alternative approach: use mermaidAPI directly
                const graphDefinition = code;

                // First, try to parse the mermaid code to check if it's valid
                try {
                    await mermaid.parse(graphDefinition);
                } catch (parseError) {
                    console.error('Mermaid parse error:', parseError);
                    return null;
                }

                // Use mermaid.render with a simpler approach
                const tempId = 'temp' + id;
                const { svg } = await mermaid.render(tempId, graphDefinition);


                // Return the SVG as-is, we'll handle it when uploading
                return svg;
            } catch (renderError) {
                console.error('Render error:', renderError);

                // Fallback: Try using mermaidAPI.render directly
                try {
                    container.textContent = code;
                    container.className = 'mermaid';

                    // Try to render using mermaid.init
                    await mermaid.init(undefined, container);

                    // Get the rendered SVG
                    const svgElement = container.querySelector('svg');
                    if (svgElement) {
                        const svgString = svgElement.outerHTML;
                        return svgString;
                    }
                } catch (fallbackError) {
                    console.error('Fallback render also failed:', fallbackError);
                }

                throw renderError;
            } finally {
                // Clean up the temporary container
                if (container.parentNode) {
                    document.body.removeChild(container);
                }

                // Also remove any leftover mermaid temp elements
                const tempElements = document.querySelectorAll(`[id*="${id}"]`);
                tempElements.forEach(el => {
                    if (el.id.includes(id) || el.id.includes('temp' + id)) {
                        el.remove();
                    }
                });
            }
        } catch (error) {
            console.error('===== MERMAID RENDERING ERROR =====');
            console.error('Error:', error);
            console.error('Error message:', error.message || 'Unknown error');
            console.error('Error stack:', error.stack);
            console.error('Failed code:', code);
            console.error('===== END MERMAID ERROR =====');
            return null;
        }
    }

    /**
     * Validate if a string is valid mermaid syntax
     * @param code The mermaid code to validate
     * @returns True if valid, false otherwise
     */
    async isValidMermaid(code: string): Promise<boolean> {
        try {
            await mermaid.parse(code);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Extract and process all mermaid blocks from markdown
     * @param markdown The markdown content
     * @returns Object with processed markdown and SVG/code map
     */
    async processMermaidBlocks(markdown: string): Promise<{
        markdown: string;
        mermaidData: Array<{ index: number; svg: string | null; code: string }>;
    }> {
        const mermaidData: Array<{ index: number; svg: string | null; code: string }> = [];

        // Regular expression to match mermaid code blocks
        const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;

        let processedMarkdown = markdown;
        let match;
        let index = 0;

        // Find all mermaid blocks
        const matches: Array<{ code: string; fullMatch: string }> = [];
        while ((match = mermaidRegex.exec(markdown)) !== null) {
            matches.push({
                code: match[1].trim(),
                fullMatch: match[0]
            });
        }


        // Process each mermaid block
        for (const { code, fullMatch } of matches) {
            // Use HTML comment as placeholder to prevent markdown processing
            const placeholder = `<!--MERMAID_PLACEHOLDER_${index}-->`;

            // Try to render the mermaid diagram
            const svg = await this.renderToSvg(code);

            if (svg) {
                mermaidData.push({ index, svg, code });
            } else {
                mermaidData.push({ index, svg: null, code });
            }

            // Replace the mermaid block with the placeholder
            processedMarkdown = processedMarkdown.replace(fullMatch, placeholder);
            index++;
        }


        return {
            markdown: processedMarkdown,
            mermaidData
        };
    }

    /**
     * Generate Confluence markup for a mermaid diagram
     * @param filename The filename of the uploaded attachment (or null if not uploaded)
     * @param code The original mermaid code
     * @returns Confluence-compatible markup
     */
    generateConfluenceMarkup(filename: string | null, code: string): string {
        if (filename) {
            // Reference the uploaded attachment with height to ensure it displays
            return `<ac:image ac:height="400"><ri:attachment ri:filename="${filename}" /></ac:image>`;
        } else {
            // Fallback to code block if no attachment
            return `<ac:structured-macro ac:name="code">
                <ac:parameter ac:name="language">mermaid</ac:parameter>
                <ac:parameter ac:name="title">Mermaid Diagram</ac:parameter>
                <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
            </ac:structured-macro>`;
        }
    }
}