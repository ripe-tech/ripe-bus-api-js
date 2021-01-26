export type KafkaRetryBindOptions = {
    callback?: ConsumerCallback,
    onSuccess?: ConsumerCallback,
    onError?: ConsumerCallback,
    retries: number
};
