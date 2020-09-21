export declare class Producer {
    constructor(kafkaClient: object);
    connect(): Promise<void>;
    disconnect(): Promise<void>
    run(messages: Array<string | object>, topic?: string): Promise<object>;
}
