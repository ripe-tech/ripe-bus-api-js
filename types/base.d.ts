import { Message } from "./message";
import { Payload } from "./payload";

export type ConsumerCallback = (message: Message) => void;

export enum Adapters {
    KAFKA = "kafka",
    KAFKA_RETRY = "kafkaRetry"
}

export type ApiOptions = {
    adapter?: Adapters
}

export type TriggerOptions = {
    name: string,
    origin?: string,
    hostname: string,
    datatype: string,
    timestamp: number
}

export type BindOptions = {
    events?: string | string[],
    autoConfirm: boolean,
    run: boolean,
    callback?: ConsumerCallback,
    onSuccess?: ConsumerCallback,
    onError?: ConsumerCallback
}

export declare class API {
    static load(): Promise<void>;

    constructor(options?: ApiOptions);
    trigger(name: string, payload: Payload, options?: TriggerOptions): Promise<void>;
    bind(topic: string, options?: ConsumerCallback | BindOptions): Promise<void>;
    topics(): Promise<string[]>;
    build(): Promise<void>;
    runConsumer(messageProcessor: Function, sendConfirmation?: Function, sendError?: Function): Promise<object>;
    sendMessages(messages: string[] | object[], topic?: string): Promise<object>;
    destroy(): Promise<void>;
}
