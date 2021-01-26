import { Message } from "./message";
import { KafkaRetryBindOptions } from "./kafka";

type ConsumerCallback = (message: Message) => void;

type BindOptions = {
    callback: ConsumerCallback,
};

export declare class API {
    static load(): Promise<void>;

    constructor(options?: Record<string, unknown>);
    trigger(topic: string, message: Message, options?: Record<string, unknown>): Promise<void>;
    bind(topic: string, options?: ConsumerCallback | BindOptions | KafkaRetryBindOptions): Promise<void>
    build(): Promise<void>
    runConsumer(messageProcessor: Function, sendConfirmation?: Function, sendError?: Function): Promise<object>;
    sendMessages(messages: Array<string | object>, topic?: string): Promise<object>;
    destroy(): Promise<void>
}
