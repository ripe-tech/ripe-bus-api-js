export declare class API {
    constructor();
    load(): Promise<void>;
    build(): Promise<void>
    runConsumer(messageProcessor: Function, sendConfirmation?: Function, sendError?: Function): Promise<object>;
    sendMessages(messages: Array<string | object>, topic?: string): Promise<object>;
    destroy(): Promise<void>
}
