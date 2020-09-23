import { NotImplementedError } from "yonius";

export class Producer {
    constructor(owner, options = {}) {
        this.owner = owner;
    }

    async connect() {
        throw new NotImplementedError();
    }

    async disconnect() {
        throw new NotImplementedError();
    }

    async produce(topic, message, options = {}) {
        throw new NotImplementedError();
    }
}
