import pino from "pino";

const logger = pino();
logger.level = Bun.env.LOG_LEVEL!;

export default logger;
