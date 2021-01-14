import { Message } from "./message";

export interface ProduceOptions {
    readonly onSuccess?: Function,
    readonly onError?: Function
}

export declare class Producer {
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>
    produce(topic: string, message: Message, options?: ProduceOptions): Promise<object>;
}
