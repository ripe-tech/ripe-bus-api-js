import { ConsumerCallback, BindOptions } from "../base";

export type KafkaBindOptions = BindOptions & {
    autoCommit?: boolean,
    autoCommitInterval?: number,
    autoCommitThreshold?: number,
    partitionsConsumedConcurrently?: boolean,
    eachBatchAutoResolve?: boolean
}

export declare class KafkaConsumer {
    constructor();
    consume(topic: string, options: KafkaBindOptions): Promise<void>;
}
