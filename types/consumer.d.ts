export declare class Consumer {
    constructor(kafkaClient: object);
    connect(): Promise<void>;
    disconnect(): Promise<void>
    run(messageProcessor: Function, sendConfirmation?: Function, sendError?: Function): Promise<object>;
}
