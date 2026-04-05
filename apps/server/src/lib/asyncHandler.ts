import type { NextFunction, Request, Response } from "express";

// Request handler type
type RequestHandlerType = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

// Async handler for express routes to handle async functions it is a wrapper function that wraps the async function in a promise and catches any errors
const AsyncHandler = (requestHandler: RequestHandlerType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export default AsyncHandler;
