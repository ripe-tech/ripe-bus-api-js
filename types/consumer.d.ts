export interface ConsumeOptions {
    readonly onSuccess?: Function,
    readonly onError?: Function
}

export declare class Consumer {
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>
    consume(topic: string, callback: Function, options?: ConsumeOptions): Promise<object>;
}
