export interface ConsumeOptions {
    events?: string | string[],
    autoConfirm?: boolean,
    run?: boolean,
    block?: boolean,
    override?: boolean,
    callback?: Function,
    onSuccess?: Function,
    onError?: Function
}

export declare class Consumer {
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>
    consume(topics: string | string[], options?: ConsumeOptions): Promise<object>;
    topics(): Promise<string[]>;
}
