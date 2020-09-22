export interface Options {
    readonly onSuccess?: Function,
    readonly onError?: Function
}

export declare class Producer {
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>
    produce(topic: string, messages: Array<string | object>, options?: Options): Promise<object>;
}
