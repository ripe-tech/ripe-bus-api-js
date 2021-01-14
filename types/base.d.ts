export declare class API {
    constructor(options?: Record<string, unknown>);
    static load(): Promise<void>;
    trigger(topic: string, message: Record<string, unknown>|Array|String, options?: Record<string, unknown>): Promise<void>;
    build(): Promise<void>
    runConsumer(messageProcessor: Function, sendConfirmation?: Function, sendError?: Function): Promise<object>;
    sendMessages(messages: Array<string | object>, topic?: string): Promise<object>;
    destroy(): Promise<void>
}
