// ğŸ”Œ API Helper - Centralized API Communication
// Error handling, retry logic, loading states

import { projectId, publicAnonKey } from './supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0`;

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Main API call function with error handling and retry logic
 */
export async function apiCall<T = any>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = 30000,
    retries = 2
  } = options;

  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const requestOptions: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json',
      ...headers
    },
    ...(body && { body: JSON.stringify(body) })
  };

  let lastError: Error | null = null;

  // Retry logic
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Timeout wrapper
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.error || errorData.message || `HTTP ${response.status}`,
          response.status,
          errorData
        );
      }

      // Parse response
      const data = await response.json();

      // Handle application-level errors
      if (!data.success && data.error) {
        throw new ApiError(data.error, response.status, data);
      }

      return data;

    } catch (error: any) {
      lastError = error;

      // Don't retry on certain errors
      if (
        error instanceof ApiError &&
        error.statusCode &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      ) {
        break; // Client errors shouldn't be retried
      }

      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // All retries failed
  console.error(`API call failed after ${retries + 1} attempts:`, lastError);

  return {
    success: false,
    error: lastError?.message || 'Unknown error occurred'
  };
}

/**
 * GET request helper
 */
export async function get<T = any>(
  endpoint: string,
  params?: Record<string, any>
): Promise<ApiResponse<T>> {
  let url = endpoint;

  if (params) {
    const queryString = new URLSearchParams(
      Object.entries(params)
        .filter(([_, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    ).toString();

    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  return apiCall<T>(url, { method: 'GET' });
}

/**
 * POST request helper
 */
export async function post<T = any>(
  endpoint: string,
  data?: any
): Promise<ApiResponse<T>> {
  return apiCall<T>(endpoint, {
    method: 'POST',
    body: data
  });
}

/**
 * PUT request helper
 */
export async function put<T = any>(
  endpoint: string,
  data?: any
): Promise<ApiResponse<T>> {
  return apiCall<T>(endpoint, {
    method: 'PUT',
    body: data
  });
}

/**
 * DELETE request helper
 */
export async function del<T = any>(
  endpoint: string
): Promise<ApiResponse<T>> {
  return apiCall<T>(endpoint, { method: 'DELETE' });
}

/**
 * PATCH request helper
 */
export async function patch<T = any>(
  endpoint: string,
  data?: any
): Promise<ApiResponse<T>> {
  return apiCall<T>(endpoint, {
    method: 'PATCH',
    body: data
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WMS SPECIFIC API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dashboard APIs
 */
export const dashboardApi = {
  getStats: (warehouseId: string) =>
    get('/wms/dashboard/stats', { warehouse_id: warehouseId }),

  getAlerts: (warehouseId: string) =>
    get('/wms/alerts', { warehouse_id: warehouseId })
};

/**
 * Inventory APIs
 */
export const inventoryApi = {
  getStock: (warehouseId: string, filters?: any) =>
    get('/wms/inventory/stock', { warehouse_id: warehouseId, ...filters }),

  getByProduct: (productId: string, warehouseId: string) =>
    get('/wms/inventory/by-product', { product_id: productId, warehouse_id: warehouseId }),

  getByLocation: (locationId: string) =>
    get('/wms/inventory/by-location', { location_id: locationId })
};

/**
 * Receiving APIs
 */
export const receivingApi = {
  list: (warehouseId: string, status?: string) =>
    get('/wms/receiving/list', { warehouse_id: warehouseId, status }),

  create: (data: any) =>
    post('/wms/receiving/create', data),

  update: (id: string, data: any) =>
    put(`/wms/receiving/${id}`, data),

  complete: (id: string) =>
    post(`/wms/receiving/${id}/complete`),

  addItem: (receivingId: string, item: any) =>
    post(`/wms/receiving/${receivingId}/items`, item)
};

/**
 * Issue/Shipping APIs
 */
export const issueApi = {
  list: (warehouseId: string, status?: string) =>
    get('/wms/issue/list', { warehouse_id: warehouseId, status }),

  create: (data: any) =>
    post('/wms/issue/create', data),

  generatePickList: (issueId: string) =>
    post(`/wms/issue/${issueId}/pick-list`),

  recordPick: (issueId: string, itemId: string, data: any) =>
    post(`/wms/issue/${issueId}/pick/${itemId}`, data),

  complete: (issueId: string) =>
    post(`/wms/issue/${issueId}/complete`)
};

/**
 * Transfer APIs
 */
export const transferApi = {
  list: (warehouseId: string, status?: string) =>
    get('/wms/transfer/list', { warehouse_id: warehouseId, status }),

  create: (data: any) =>
    post('/wms/transfer/create', data),

  execute: (transferId: string) =>
    post(`/wms/transfer/${transferId}/execute`),

  complete: (transferId: string) =>
    post(`/wms/transfer/${transferId}/complete`)
};

/**
 * Counting APIs
 */
export const countingApi = {
  list: (warehouseId: string) =>
    get('/wms/counting/list', { warehouse_id: warehouseId }),

  create: (data: any) =>
    post('/wms/counting/create', data),

  recordCount: (countId: string, data: any) =>
    post(`/wms/counting/${countId}/record`, data),

  processVariance: (countId: string) =>
    post(`/wms/counting/${countId}/process-variance`),

  approve: (countId: string) =>
    post(`/wms/counting/${countId}/approve`)
};

/**
 * Returns APIs
 */
export const returnsApi = {
  list: (warehouseId: string) =>
    get('/wms/returns/list', { warehouse_id: warehouseId }),

  create: (data: any) =>
    post('/wms/returns/create', data),

  inspect: (returnId: string, data: any) =>
    post(`/wms/returns/${returnId}/inspect`, data),

  complete: (returnId: string) =>
    post(`/wms/returns/${returnId}/complete`)
};

/**
 * Quality Control APIs
 */
export const qualityApi = {
  list: (warehouseId: string) =>
    get('/wms/quality/list', { warehouse_id: warehouseId }),

  createInspection: (data: any) =>
    post('/wms/quality/inspection', data),

  recordResult: (inspectionId: string, data: any) =>
    post(`/wms/quality/inspection/${inspectionId}/result`, data)
};

/**
 * Task APIs
 */
export const taskApi = {
  list: (warehouseId: string, filters?: any) =>
    get('/wms/tasks/list', { warehouse_id: warehouseId, ...filters }),

  create: (data: any) =>
    post('/wms/tasks/create', data),

  assign: (taskId: string, userId: string) =>
    post(`/wms/tasks/${taskId}/assign`, { user_id: userId }),

  start: (taskId: string) =>
    post(`/wms/tasks/${taskId}/start`),

  complete: (taskId: string, data?: any) =>
    post(`/wms/tasks/${taskId}/complete`, data)
};

/**
 * Reports APIs
 */
export const reportsApi = {
  getInventoryValuation: (warehouseId: string, date?: string) =>
    get('/wms/reports/inventory-valuation', { warehouse_id: warehouseId, date }),

  getStockMovement: (warehouseId: string, startDate: string, endDate: string) =>
    get('/wms/reports/stock-movement', { warehouse_id: warehouseId, start_date: startDate, end_date: endDate }),

  getABCAnalysis: (warehouseId: string) =>
    get('/wms/reports/abc-analysis', { warehouse_id: warehouseId }),

  getDailyActivity: (warehouseId: string, date: string) =>
    get('/wms/reports/daily-activity', { warehouse_id: warehouseId, date })
};

/**
 * Warehouses APIs
 */
export const warehouseApi = {
  list: () =>
    get('/wms/warehouses'),

  get: (id: string) =>
    get(`/wms/warehouses/${id}`),

  getLocations: (warehouseId: string) =>
    get('/wms/locations', { warehouse_id: warehouseId })
};

/**
 * Error handler for UI
 */
export function handleApiError(error: any): string {
  if (typeof error === 'string') return error;
  if (error instanceof ApiError) return error.message;
  if (error?.error) return error.error;
  if (error?.message) return error.message;
  return 'Bir hata oluştu. Lütfen tekrar deneyin.';
}

/**
 * Success checker
 */
export function isSuccess<T>(response: ApiResponse<T>): response is ApiResponse<T> & { data: T } {
  return response.success === true && response.data !== undefined;
}

export default {
  get,
  post,
  put,
  del,
  patch,
  dashboard: dashboardApi,
  inventory: inventoryApi,
  receiving: receivingApi,
  issue: issueApi,
  transfer: transferApi,
  counting: countingApi,
  returns: returnsApi,
  quality: qualityApi,
  task: taskApi,
  reports: reportsApi,
  warehouse: warehouseApi,
  handleError: handleApiError,
  isSuccess
};
