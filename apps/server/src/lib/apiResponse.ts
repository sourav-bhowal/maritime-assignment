type ApiResponseParams<T> = {
  statusCode: number;
  data: T;
  message?: string;
};

// Purpose: Define the structure of the API response.
class ApiResponse<T> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;

  constructor({
    statusCode,
    data,
    message = "Successful",
  }: ApiResponseParams<T>) {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}

export default ApiResponse;
