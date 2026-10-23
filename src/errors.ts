/** Errors raised on purpose. */

export class ScbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScbError";
  }
}

/** The configuration is missing or wrong, and nothing will work until it is fixed. */
export class ConfigError extends ScbError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** The register answered with something other than success. */
export class UpstreamError extends ScbError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}
