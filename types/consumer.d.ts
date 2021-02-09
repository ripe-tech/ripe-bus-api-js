export interface ConsumeOptions {
    events?: string | string[],
    onSuccess?: Function,
    onError?: Function
}

export declare class Consumer {
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>
    consume(topics: string | string[], callback: Function, options?: ConsumeOptions): Promise<object>;
}
