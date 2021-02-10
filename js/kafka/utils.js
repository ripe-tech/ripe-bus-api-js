export const sanitizeTopicName = topic => {
    const illegalChars = /[^a-zA-Z0-9\\._\\-]/g;
    return topic.replace(illegalChars, "_");
};
