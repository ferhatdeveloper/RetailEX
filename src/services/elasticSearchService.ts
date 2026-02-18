// ElasticSearch Service for Advanced Search & Analytics

export interface ElasticSearchConfig {
  endpoint: string;
  apiKey?: string;
  indices: {
    stores: string;
    products: string;
    customers: string;
    sales: string;
  };
}

export interface SearchQuery {
  query: string;
  filters?: {
    [key: string]: any;
  };
  from?: number;
  size?: number;
  sort?: Array<{ [field: string]: 'asc' | 'desc' }>;
}

export interface SearchResult<T> {
  hits: {
    total: number;
    data: T[];
  };
  aggregations?: any;
  took: number;
}

export interface IndexDocument {
  id: string;
  [key: string]: any;
}

class ElasticSearchService {
  private config: ElasticSearchConfig = {
    endpoint: 'http://localhost:9200', // Default local endpoint
    indices: {
      stores: 'retailos-stores',
      products: 'retailos-products',
      customers: 'retailos-customers',
      sales: 'retailos-sales'
    }
  };

  private isConnected: boolean = false;
  private simulationMode: boolean = true; // For frontend demo without real ES

  constructor(config?: Partial<ElasticSearchConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.init();
  }

  /**
   * Initialize connection
   */
  private async init() {
    if (this.simulationMode) {
      console.log('ğŸ” ElasticSearch Service (Simulation Mode)');
      this.isConnected = true;
      return;
    }

    try {
      // In real implementation, test connection
      // const response = await fetch(`${this.config.endpoint}/_cluster/health`);
      // this.isConnected = response.ok;

      console.log('ğŸ” ElasticSearch connected:', this.config.endpoint);
    } catch (error) {
      console.error('❌ ElasticSearch connection failed:', error);
      this.isConnected = false;
    }
  }

  /**
   * Search stores with advanced filtering
   */
  async searchStores(query: SearchQuery): Promise<SearchResult<any>> {
    if (this.simulationMode) {
      return this.simulateSearch('stores', query);
    }

    // Real ElasticSearch query
    const esQuery = this.buildElasticQuery(query);
    const response = await this.executeQuery(this.config.indices.stores, esQuery);
    return this.parseResponse(response);
  }

  /**
   * Search products
   */
  async searchProducts(query: SearchQuery): Promise<SearchResult<any>> {
    if (this.simulationMode) {
      return this.simulateSearch('products', query);
    }

    const esQuery = this.buildElasticQuery(query);
    const response = await this.executeQuery(this.config.indices.products, esQuery);
    return this.parseResponse(response);
  }

  /**
   * Search customers
   */
  async searchCustomers(query: SearchQuery): Promise<SearchResult<any>> {
    if (this.simulationMode) {
      return this.simulateSearch('customers', query);
    }

    const esQuery = this.buildElasticQuery(query);
    const response = await this.executeQuery(this.config.indices.customers, esQuery);
    return this.parseResponse(response);
  }

  /**
   * Full-text search across all indices
   */
  async globalSearch(query: string, size: number = 10): Promise<any> {
    if (this.simulationMode) {
      return {
        stores: await this.searchStores({ query, size }),
        products: await this.searchProducts({ query, size }),
        customers: await this.searchCustomers({ query, size })
      };
    }

    // Real implementation would use multi-index search
    const indices = Object.values(this.config.indices).join(',');
    const esQuery = {
      query: {
        multi_match: {
          query,
          fields: ['name^3', 'code^2', 'description', 'tags'],
          fuzziness: 'AUTO'
        }
      },
      size
    };

    const response = await this.executeQuery(indices, esQuery);
    return this.parseResponse(response);
  }

  /**
   * Aggregation query (for analytics)
   */
  async aggregate(index: 'stores' | 'products' | 'customers' | 'sales', aggregations: any): Promise<any> {
    if (this.simulationMode) {
      return this.simulateAggregation(index, aggregations);
    }

    const esQuery = {
      size: 0,
      aggs: aggregations
    };

    const response = await this.executeQuery(this.config.indices[index], esQuery);
    return response.aggregations;
  }

  /**
   * Index a document
   */
  async indexDocument(index: 'stores' | 'products' | 'customers' | 'sales', doc: IndexDocument): Promise<void> {
    if (this.simulationMode) {
      console.log('📝 Indexed (simulation):', index, doc.id);
      return;
    }

    const endpoint = `${this.config.endpoint}/${this.config.indices[index]}/_doc/${doc.id}`;

    await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `ApiKey ${this.config.apiKey}` })
      },
      body: JSON.stringify(doc)
    });

    console.log('✅ Indexed:', index, doc.id);
  }

  /**
   * Bulk index documents
   */
  async bulkIndex(index: 'stores' | 'products' | 'customers' | 'sales', docs: IndexDocument[]): Promise<void> {
    if (this.simulationMode) {
      console.log('📦 Bulk indexed (simulation):', docs.length, 'documents');
      return;
    }

    // Build bulk request body
    const body = docs.flatMap(doc => [
      { index: { _index: this.config.indices[index], _id: doc.id } },
      doc
    ]);

    const endpoint = `${this.config.endpoint}/_bulk`;

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-ndjson',
        ...(this.config.apiKey && { 'Authorization': `ApiKey ${this.config.apiKey}` })
      },
      body: body.map(item => JSON.stringify(item)).join('\n') + '\n'
    });

    console.log('✅ Bulk indexed:', docs.length, 'documents');
  }

  /**
   * Delete document
   */
  async deleteDocument(index: 'stores' | 'products' | 'customers' | 'sales', id: string): Promise<void> {
    if (this.simulationMode) {
      console.log('ğŸ—‘ï¸ Deleted (simulation):', index, id);
      return;
    }

    const endpoint = `${this.config.endpoint}/${this.config.indices[index]}/_doc/${id}`;

    await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        ...(this.config.apiKey && { 'Authorization': `ApiKey ${this.config.apiKey}` })
      }
    });

    console.log('✅ Deleted:', index, id);
  }

  /**
   * Build ElasticSearch query from SearchQuery
   */
  private buildElasticQuery(query: SearchQuery): any {
    const esQuery: any = {
      from: query.from || 0,
      size: query.size || 10
    };

    // Build query
    if (query.query) {
      esQuery.query = {
        bool: {
          must: [
            {
              multi_match: {
                query: query.query,
                fields: ['name^3', 'code^2', 'description', 'tags'],
                fuzziness: 'AUTO',
                operator: 'and'
              }
            }
          ],
          filter: []
        }
      };
    } else {
      esQuery.query = { match_all: {} };
    }

    // Add filters
    if (query.filters) {
      const filters = Object.entries(query.filters).map(([field, value]) => {
        if (Array.isArray(value)) {
          return { terms: { [field]: value } };
        }
        return { term: { [field]: value } };
      });

      if (esQuery.query.bool) {
        esQuery.query.bool.filter = filters;
      } else {
        esQuery.query = {
          bool: {
            must: { match_all: {} },
            filter: filters
          }
        };
      }
    }

    // Add sorting
    if (query.sort) {
      esQuery.sort = query.sort;
    }

    return esQuery;
  }

  /**
   * Execute ElasticSearch query
   */
  private async executeQuery(index: string, query: any): Promise<any> {
    const endpoint = `${this.config.endpoint}/${index}/_search`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `ApiKey ${this.config.apiKey}` })
      },
      body: JSON.stringify(query)
    });

    return await response.json();
  }

  /**
   * Parse ElasticSearch response
   */
  private parseResponse(response: any): SearchResult<any> {
    return {
      hits: {
        total: response.hits.total.value || response.hits.total,
        data: response.hits.hits.map((hit: any) => ({
          id: hit._id,
          score: hit._score,
          ...hit._source
        }))
      },
      aggregations: response.aggregations,
      took: response.took
    };
  }

  /**
   * Simulate search (for demo without real ElasticSearch)
   */
  private async simulateSearch(index: string, query: SearchQuery): Promise<SearchResult<any>> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));

    const mockData = this.getMockData(index);
    const filtered = mockData.filter((item: any) => {
      if (!query.query) return true;

      const searchStr = query.query.toLowerCase();
      return (
        item.name?.toLowerCase().includes(searchStr) ||
        item.code?.toLowerCase().includes(searchStr) ||
        item.description?.toLowerCase().includes(searchStr)
      );
    });

    const from = query.from || 0;
    const size = query.size || 10;
    const paged = filtered.slice(from, from + size);

    return {
      hits: {
        total: filtered.length,
        data: paged
      },
      took: 15
    };
  }

  /**
   * Simulate aggregations
   */
  private async simulateAggregation(index: string, aggregations: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 30));

    // Return mock aggregation results
    return {
      by_region: {
        buckets: [
          { key: 'Kuzeybatı', doc_count: 2500 },
          { key: 'Batı', doc_count: 2000 },
          { key: 'İç Anadolu', doc_count: 1800 }
        ]
      }
    };
  }

  /**
   * Get mock data for simulation
   */
  private getMockData(index: string): any[] {
    switch (index) {
      case 'stores':
        return [
          { id: 'store-1', name: 'Kadıköy Mağazası', code: 'MG001', region: 'Kuzeybatı' },
          { id: 'store-2', name: 'Beşiktaş Mağazası', code: 'MG002', region: 'Kuzeybatı' },
          { id: 'store-3', name: 'Ankara Çankaya', code: 'MG003', region: 'İç Anadolu' }
        ];
      case 'products':
        return [
          { id: 'prod-1', name: 'Laptop Dell XPS', code: 'LAPTOP001', price: 15000 },
          { id: 'prod-2', name: 'Mouse Logitech', code: 'MOUSE001', price: 250 }
        ];
      case 'customers':
        return [
          { id: 'cust-1', name: 'Ahmet Yılmaz', phone: '5551234567' },
          { id: 'cust-2', name: 'Ayşe Demir', phone: '5559876543' }
        ];
      default:
        return [];
    }
  }

  /**
   * Check if connected
   */
  isServiceConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get service status
   */
  getStatus(): { connected: boolean; mode: 'simulation' | 'real'; endpoint: string } {
    return {
      connected: this.isConnected,
      mode: this.simulationMode ? 'simulation' : 'real',
      endpoint: this.config.endpoint
    };
  }
}

// Singleton instance
export const elasticSearchService = new ElasticSearchService();

