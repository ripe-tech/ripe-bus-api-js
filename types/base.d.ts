import { Message } from "./message";

export declare class API {
    static load(): Promise<void>;

    constructor(options?: Record<string, unknown>);
    trigger(topic: string, message: Message, options?: Record<string, unknown>): Promise<void>;
    build(): Promise<void>
    runConsumer(messageProcessor: Function, sendConfirmation?: Function, sendError?: Function): Promise<object>;
    sendMessages(messages: Array<string | object>, topic?: string): Promise<object>;
    destroy(): Promise<void>
}
