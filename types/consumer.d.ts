export interface Options {
    readonly onSuccess?: Function,
    readonly onError?: Function
}

export declare class Consumer {
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>
    consume(topic: string, callback: Function, options?: Options): Promise<object>;
}
