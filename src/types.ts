export interface ConfluenceSettings {
    apiToken: string;
    baseUrl: string;
    useEnvironmentToken: boolean;
    defaultSpaceKey: string;
    lastPageId: string;
    authType: 'bearer' | 'basic';
    username: string;
    enableMermaid: boolean;
}

export interface ConfluencePage {
    id: string;
    type: string;
    status: string;
    title: string;
    version: {
        number: number;
    };
    body?: {
        storage?: {
            value: string;
            representation: string;
        };
    };
}

export interface ConfluenceUpdateRequest {
    version: {
        number: number;
    };
    type: string;
    title: string;
    body: {
        storage: {
            value: string;
            representation: string;
        };
    };
}

export interface ConfluenceApiError {
    statusCode: number;
    message: string;
    data?: {
        authorized: boolean;
        valid: boolean;
        errors: Array<{
            message: string;
        }>;
    };
}