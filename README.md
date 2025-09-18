# Obsidian Confluence Upload Plugin

Upload your Obsidian notes directly to Confluence pages via REST API.

## Features

- Upload markdown notes to Confluence with a single command
- Maintains formatting including:
  - Headers, bold, italic, strikethrough
  - Lists (ordered and unordered)
  - Tables
  - Code blocks with syntax highlighting
  - Links and images
- Render mermaid diagrams to SVGs and embed in the page

## Installation

1. Copy the plugin folder to your vault's `.obsidian/plugins/` directory
2. Enable the plugin in Obsidian Settings → Community plugins
3. Configure your Confluence settings in the plugin settings tab

## Configuration

1. Open Settings → Confluence Upload
2. Configure:
   - **Base URL**: Your Confluence instance URL (e.g., `https://confluence.example.com`)
   - **API Token**: Your personal API token for authentication
   - **Default Space Key**: Optional default space for new pages

## Usage

### Upload to Existing Page

1. Open the note you want to upload
2. Use Command Palette (`Ctrl/Cmd + P`) → "Upload current note to Confluence"
3. Enter the Confluence page ID
4. Click Upload

### Create New Page

1. Open the note you want to upload
2. Use Command Palette → "Create new Confluence page from current note"
3. Enter:
   - Space Key
   - Page Title
   - Parent Page ID (optional)
4. Click Create & Upload

### Keyboard Shortcut

- `Ctrl/Cmd + Shift + U`: Upload current note to Confluence

### API Support

- Uses Confluence REST API v1
- Supports Bearer token authentication and Basic auth
- Handles version management automatically

## Troubleshooting

### Connection Failed
- Verify your base URL is correct
- Check that your API token is valid
- Ensure you have network access to Confluence

### Upload Failed
- Verify the page ID exists
- Check you have edit permissions for the page
- Ensure the content doesn't exceed Confluence limits

### Code Blocks Not Rendering
- The plugin uses CDATA sections to preserve code
- Verify your Confluence instance supports the code macro

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development mode with watch
npm run dev

# Type checking
npm run typecheck
```

## License

GPL-3.0

## Support

For issues or feature requests, please create an issue on the plugin's repository.


