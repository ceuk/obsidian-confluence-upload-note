import { Notice, requestUrl, RequestUrlParam } from 'obsidian';
import { ConfluenceSettings, ConfluencePage, ConfluenceUpdateRequest, ConfluenceApiError } from './types';

export class ConfluenceAPI {
    private settings: ConfluenceSettings;

    constructor(settings: ConfluenceSettings) {
        this.settings = settings;
    }

    private getAuthToken(): string {
        if (this.settings.useEnvironmentToken) {
            // In Obsidian, we can't directly access environment variables
            // This would need to be set through a different mechanism
            // For now, fall back to settings token
            console.warn('Environment variable access not available in Obsidian. Using settings token.');
            return this.settings.apiToken;
        }
        return this.settings.apiToken;
    }

    private getHeaders(): HeadersInit {
        const token = this.getAuthToken();

        if (this.settings.authType === 'basic') {
            // For Confluence Server/Data Center, use Basic authentication
            if (!this.settings.username || !token) {
                throw new Error('Username and API token/password are required for Basic authentication. Please check settings.');
            }
            const credentials = btoa(`${this.settings.username}:${token}`);
            return {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
        } else {
            // For Confluence Cloud, use Bearer token
            if (!token) {
                throw new Error('API token not configured. Please check settings.');
            }
            return {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const headers = this.getHeaders();
            const url = `${this.settings.baseUrl}/rest/api/content?limit=1`;

            const response = await requestUrl({
                url: url,
                method: 'GET',
                headers: headers as Record<string, string>
            });

            if (response.status >= 200 && response.status < 300) {
                return true;
            }

            if (response.status === 401) {
                throw new Error(`Authentication failed (401). ${this.settings.authType === 'basic' ?
                    'Check username and API token/password.' :
                    'Check API token.'}`);
            } else if (response.status === 404) {
                throw new Error(`API endpoint not found (404). Check the base URL. Tried: ${url}`);
            } else if (response.status === 403) {
                throw new Error(`Access forbidden (403). You may not have permissions or the API might be disabled.`);
            }

            throw new Error(`Connection failed with status ${response.status}`);
        } catch (error) {
            console.error('Connection test exception:', error);
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Unexpected error: ${String(error)}`);
        }
    }

    async getPage(pageId: string): Promise<ConfluencePage> {
        if (!pageId) {
            throw new Error('Page ID is required');
        }

        try {
            const response = await requestUrl({
                url: `${this.settings.baseUrl}/rest/api/content/${pageId}?expand=version,body.storage`,
                method: 'GET',
                headers: this.getHeaders() as Record<string, string>
            });

            if (response.status !== 200) {
                throw new Error(`Failed to fetch page: ${response.status} - ${response.text}`);
            }

            return response.json as ConfluencePage;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to fetch page: ${error}`);
        }
    }

    async updatePage(pageId: string, content: string, title?: string): Promise<void> {
        if (!pageId) {
            throw new Error('Page ID is required');
        }

        try {
            // First, get the current page details to obtain version and title
            const currentPage = await this.getPage(pageId);
            const newVersion = currentPage.version.number + 1;
            const pageTitle = title || currentPage.title;

            const updateRequest: ConfluenceUpdateRequest = {
                version: {
                    number: newVersion
                },
                type: 'page',
                title: pageTitle,
                body: {
                    storage: {
                        value: content,
                        representation: 'storage'
                    }
                }
            };


            let response;
            try {
                response = await requestUrl({
                    url: `${this.settings.baseUrl}/rest/api/content/${pageId}`,
                    method: 'PUT',
                    headers: this.getHeaders() as Record<string, string>,
                    body: JSON.stringify(updateRequest),
                    throw: false  // Don't throw on error status codes, we'll handle them
                });
            } catch (networkError) {
                // This catches network errors, not HTTP errors
                console.error('Network error during request:', networkError);
                throw new Error(`Network error: ${networkError.message || networkError}`);
            }

            if (response.status < 200 || response.status >= 300) {
                let errorMessage = `Failed to update page: ${response.status}`;


                // Try to get error details from different possible locations
                let errorDetails = '';
                let parsedError = null;

                // Try response.text first (most common)
                if (response.text) {
                    errorDetails = response.text;
                }

                // Try response.json
                if (response.json) {
                    parsedError = response.json;
                }

                // Try to parse text as JSON if we haven't already
                if (errorDetails && !parsedError) {
                    try {
                        parsedError = JSON.parse(errorDetails);
                    } catch (e) {
                        // Ignore parsing error
                    }
                }

                // Extract error message from parsed response
                if (parsedError) {
                    if (parsedError.message) {
                        errorMessage = `${errorMessage}: ${parsedError.message}`;
                    }

                    if (parsedError.data?.errors && Array.isArray(parsedError.data.errors)) {
                        if (parsedError.data.errors[0]?.message) {
                            errorMessage = `${errorMessage}: ${parsedError.data.errors[0].message}`;
                        }
                    }
                }

                // If we still don't have details, show what we have
                if (!errorDetails && !parsedError) {
                    errorDetails = 'No error details available';
                }

                throw new Error(errorMessage);
            }

            // Save the page ID for future use
            this.settings.lastPageId = pageId;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to update page: ${error}`);
        }
    }

    async createPage(spaceKey: string, title: string, content: string, parentId?: string): Promise<string> {
        if (!spaceKey || !title) {
            throw new Error('Space key and title are required');
        }

        const createRequest: any = {
            type: 'page',
            title: title,
            space: {
                key: spaceKey
            },
            body: {
                storage: {
                    value: content,
                    representation: 'storage'
                }
            }
        };

        if (parentId) {
            createRequest.ancestors = [{
                id: parentId
            }];
        }

        try {
            const response = await requestUrl({
                url: `${this.settings.baseUrl}/rest/api/content`,
                method: 'POST',
                headers: this.getHeaders() as Record<string, string>,
                body: JSON.stringify(createRequest)
            });

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`Failed to create page: ${response.status} - ${response.text}`);
            }

            const newPage = response.json as ConfluencePage;
            return newPage.id;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to create page: ${error}`);
        }
    }

    async searchPages(query: string, spaceKey?: string, limit: number = 10): Promise<ConfluencePage[]> {
        let cql = `title ~ "${query}"`;
        if (spaceKey) {
            cql = `space = ${spaceKey} AND ${cql}`;
        }

        try {
            const response = await requestUrl({
                url: `${this.settings.baseUrl}/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=${limit}`,
                method: 'GET',
                headers: this.getHeaders() as Record<string, string>
            });

            if (response.status !== 200) {
                throw new Error(`Failed to search pages: ${response.status} - ${response.text}`);
            }

            const result = response.json as any;
            return result.results as ConfluencePage[];
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to search pages: ${error}`);
        }
    }

    getPageUrl(pageId: string): string {
        return `${this.settings.baseUrl}/pages/viewpage.action?pageId=${pageId}`;
    }

    async uploadAttachment(pageId: string, fileName: string, content: string, mimeType: string = 'image/svg+xml'): Promise<string> {
        if (!pageId || !fileName || !content) {
            throw new Error('Page ID, file name, and content are required');
        }

        try {
            // Build multipart/form-data body manually
            const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

            // Build multipart body parts separately to handle binary content properly
            const encoder = new TextEncoder();

            // Build header part
            let headerPart = '';
            headerPart += `--${boundary}\r\n`;
            headerPart += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
            headerPart += `Content-Type: ${mimeType}\r\n`;
            headerPart += `\r\n`; // Critical: Empty line before content

            // Build footer parts
            let footerPart = '';
            footerPart += `\r\n`;
            footerPart += `--${boundary}\r\n`;
            footerPart += `Content-Disposition: form-data; name="comment"\r\n`;
            footerPart += `\r\n`;
            footerPart += `Mermaid diagram`;
            footerPart += `\r\n`;
            footerPart += `--${boundary}--\r\n`;

            // Encode parts to bytes
            const headerBytes = encoder.encode(headerPart);
            const contentBytes = encoder.encode(content); // SVG content as bytes
            const footerBytes = encoder.encode(footerPart);

            // Combine all parts into single ArrayBuffer
            const totalLength = headerBytes.length + contentBytes.length + footerBytes.length;
            const bodyBuffer = new Uint8Array(totalLength);
            bodyBuffer.set(headerBytes, 0);
            bodyBuffer.set(contentBytes, headerBytes.length);
            bodyBuffer.set(footerBytes, headerBytes.length + contentBytes.length);

            // For debugging, create string version
            const bodyString = headerPart + content + footerPart;

            // Get headers and set multipart content type with boundary
            // Use bracket notation for headers with hyphens - known Obsidian requestUrl issue
            const headers: Record<string, string> = {
                ...this.getHeaders() as Record<string, string>,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                ["X-Atlassian-Token"]: "nocheck", // Use bracket notation - requestUrl has issues with hyphenated headers
                ["x-atlassian-token"]: "nocheck", // Try lowercase too
                "User-Agent": "Obsidian.md" // Some users report this helps
            };

            // First, check if attachment already exists and update it
            const checkUrl = `${this.settings.baseUrl}/rest/api/content/${pageId}/child/attachment?filename=${fileName}`;
            // Try adding the X-Atlassian-Token as a query parameter as well
            const url = `${this.settings.baseUrl}/rest/api/content/${pageId}/child/attachment?X-Atlassian-Token=nocheck`;


            let response;
            let uploadUrl = url;  // Declare uploadUrl in outer scope

            try {
                // Check if we need to update existing attachment
                const checkHeaders = this.getHeaders() as Record<string, string>;
                const checkResponse = await requestUrl({
                    url: checkUrl,
                    method: 'GET',
                    headers: checkHeaders,
                    throw: false
                });

                let method = 'POST';

                if (checkResponse.status === 200 && checkResponse.json?.results?.length > 0) {
                    // Attachment exists - need to delete it first
                    const existingAttachment = checkResponse.json.results[0];

                    // Delete the existing attachment
                    const deleteUrl = `${this.settings.baseUrl}/rest/api/content/${existingAttachment.id}`;
                    const deleteHeaders: Record<string, string> = {
                        ...this.getHeaders() as Record<string, string>,
                        ["X-Atlassian-Token"]: "nocheck"
                    };

                    const deleteResponse = await requestUrl({
                        url: deleteUrl,
                        method: 'DELETE',
                        headers: deleteHeaders,
                        throw: false
                    });

                    if (deleteResponse.status !== 204 && deleteResponse.status !== 200) {
                        console.error('Failed to delete existing attachment:', deleteResponse.status, deleteResponse.text);
                        throw new Error(`Failed to delete existing attachment: ${deleteResponse.status}`);
                    }
                    // Continue with normal upload
                    uploadUrl = url;
                    method = 'POST';
                }

                // requestUrl might not handle ArrayBuffer correctly for multipart
                // Let's just send the string directly

                response = await requestUrl({
                    url: uploadUrl,
                    method: method,
                    headers: headers,
                    body: bodyString,  // Send as string instead of ArrayBuffer
                    throw: false // Don't throw, we'll handle errors
                });
            } catch (networkError: any) {
                console.error('Network error during attachment upload:', networkError);
                throw new Error(`Network error: ${networkError.message || networkError}`);
            }

            // Check for XSRF error specifically
            if (response.text === 'XSRF check failed') {
                // Try the older drag-and-drop endpoint which might not have XSRF protection
                try {
                    const oldUrl = `${this.settings.baseUrl}/plugins/drag-and-drop/upload.action?pageId=${pageId}`;

                    // For the older endpoint, we might need different form field names
                    const oldBodyParts: string[] = [];
                    oldBodyParts.push(`--${boundary}\r\n`);
                    oldBodyParts.push(`Content-Disposition: form-data; name="file-0"; filename="${fileName}"\r\n`);
                    oldBodyParts.push(`Content-Type: ${mimeType}\r\n\r\n`);
                    oldBodyParts.push(content);
                    oldBodyParts.push(`\r\n--${boundary}\r\n`);
                    // Add page ID as form field
                    oldBodyParts.push(`Content-Disposition: form-data; name="pageId"\r\n\r\n`);
                    oldBodyParts.push(pageId);
                    oldBodyParts.push(`\r\n--${boundary}--\r\n`);

                    const oldBodyString = oldBodyParts.join('');
                    const oldBodyBuffer = encoder.encode(oldBodyString);

                    const oldResponse = await requestUrl({
                        url: oldUrl,
                        method: 'POST',
                        headers: headers,
                        body: oldBodyBuffer,
                        throw: false
                    });

                    if (oldResponse.status >= 200 && oldResponse.status < 300) {
                        return fileName; // Return the filename for reference
                    } else {
                        console.error('Old endpoint also failed:', oldResponse.status, oldResponse.text);
                        throw new Error(`Both upload endpoints failed. Old endpoint returned: ${oldResponse.status}`);
                    }
                } catch (oldError: any) {
                    console.error('Old endpoint error:', oldError);
                    throw new Error(`XSRF check failed on modern API, old endpoint also failed: ${oldError.message}`);
                }
            }

            if (response.status === 403) {
                throw new Error(`403 Forbidden: You don't have permission to add attachments to page ${pageId}`);
            }

            if (response.status < 200 || response.status >= 300) {
                console.error('Attachment upload failed:', response.status, response.text);
                throw new Error(`Failed to upload attachment: ${response.status} - ${response.text}`);
            }

            const result = response.json as any;

            // Return the filename for reference in ac:image macro
            if (result.results && result.results.length > 0) {
                return fileName; // Just return the filename, we'll use ri:attachment
            }

            throw new Error('No attachment created');
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Failed to upload attachment: ${error}`);
        }
    }
}