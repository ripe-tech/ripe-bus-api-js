import { NotImplementedError } from "yonius";

export class Consumer {
    constructor(owner, options = {}) {
        this.owner = owner;
    }

    async connect() {
        throw new NotImplementedError();
    }

    async disconnect() {
        throw new NotImplementedError();
    }

    async consume(topics, callback, options = {}) {
        throw new NotImplementedError();
    }
}
