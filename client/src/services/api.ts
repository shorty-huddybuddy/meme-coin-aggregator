import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { ApiResponse, TokenData, FilterOptions, SortOptions } from '../types';

class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = 'http://localhost:3000/api') {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
    });
  }

  async getTokens(
    filters?: FilterOptions,
    sort?: SortOptions,
    limit: number = 30,
    cursor?: string
  ): Promise<ApiResponse<TokenData[]>> {
    const params: Record<string, string | number> = { limit };
    
    if (cursor) params.cursor = cursor;
    if (filters?.timePeriod) params.timePeriod = filters.timePeriod;
    if (filters?.minVolume !== undefined) params.minVolume = filters.minVolume;
    if (filters?.maxVolume !== undefined) params.maxVolume = filters.maxVolume;
    if (filters?.minMarketCap !== undefined) params.minMarketCap = filters.minMarketCap;
    if (filters?.maxMarketCap !== undefined) params.maxMarketCap = filters.maxMarketCap;
    if (filters?.protocol) params.protocol = filters.protocol;
    if (sort?.sortBy) params.sortBy = sort.sortBy;
    if (sort?.sortOrder) params.sortOrder = sort.sortOrder;
    if (sort?.timePeriod) params.timePeriod = sort.timePeriod;

    const response = await this.client.get<ApiResponse<TokenData[]>>('/tokens', { params });
    return response.data;
  }

  async searchTokens(query: string, limit: number = 20): Promise<ApiResponse<TokenData[]>> {
    const response = await this.client.get<ApiResponse<TokenData[]>>('/tokens/search', {
      params: { q: query, limit },
    });
    return response.data;
  }

  async getHealth(): Promise<{ success: boolean; data: { status: string; timestamp: string } }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
