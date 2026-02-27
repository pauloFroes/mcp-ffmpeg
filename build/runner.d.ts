export declare function toolResult(data: unknown): {
    content: {
        type: "text";
        text: string;
    }[];
};
export declare function toolError(message: string): {
    isError: true;
    content: {
        type: "text";
        text: string;
    }[];
};
export declare function toolResultWithImages(data: unknown, images: Array<{
    base64: string;
    mimeType: string;
}>): {
    content: ({
        type: "image";
        data: string;
        mimeType: string;
    } | {
        type: "text";
        text: string;
    })[];
};
export declare function execCommand(command: string, args: string[], options?: {
    timeout?: number;
}): Promise<{
    stdout: string;
    stderr: string;
}>;
export declare function createTempDir(): Promise<string>;
export declare function cleanupTempDir(dir: string): Promise<void>;
export declare function readFileAsBase64(filePath: string): Promise<string>;
