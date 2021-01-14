export interface ProduceOptions {
    readonly onSuccess?: Function,
    readonly onError?: Function
}

export type Item = string | object;

export declare class Producer {
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>
    produce(topic: string, message: Item | Array<Item>, options?: ProduceOptions): Promise<object>;
}
