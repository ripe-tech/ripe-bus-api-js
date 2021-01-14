export interface ProduceOptions {
    readonly onSuccess?: Function,
    readonly onError?: Function
}

export type Item = string | object;
export type Message = Item | Array<Item>;

export declare class Producer {
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>
    produce(topic: string, message: Message, options?: ProduceOptions): Promise<object>;
}
