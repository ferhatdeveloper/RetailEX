/**
 * Field Sales Management Service
 * Pattern: Strategy Pattern + Observer Pattern + State Pattern
 * Features: Route planning, GPS tracking, visit management, live location
 */

// Location
export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
}

// Route
export interface SalesRoute {
  id: string;
  name: string;
  salesperson_id: string;
  date: string;
  status: RouteStatus;
  planned_visits: PlannedVisit[];
  actual_distance: number;
  planned_distance: number;
  start_time?: string;
  end_time?: string;
  start_location?: GeoLocation;
  end_location?: GeoLocation;
}

export type RouteStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// Planned Visit
export interface PlannedVisit {
  id: string;
  route_id: string;
  customer_id: string;
  customer_name: string;
  customer_address: string;
  location: GeoLocation;
  sequence: number;
  planned_time?: string;
  estimated_duration: number; // minutes
  visit_type: VisitType;
  objectives: string[];
  status: VisitStatus;
}

export type VisitType = 'SALES' | 'COLLECTION' | 'SURVEY' | 'COMPLAINT' | 'DEMO' | 'FOLLOW_UP';
export type VisitStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';

// Actual Visit (Check-in/out)
export interface Visit {
  id: string;
  planned_visit_id?: string;
  route_id: string;
  salesperson_id: string;
  customer_id: string;
  customer_name: string;
  visit_type: VisitType;
  check_in_time: string;
  check_in_location: GeoLocation;
  check_out_time?: string;
  check_out_location?: GeoLocation;
  duration?: number; // minutes
  distance_from_customer: number; // meters
  photos: string[];
  notes?: string;
  outcomes: VisitOutcome;
  status: VisitStatus;
}

export interface VisitOutcome {
  orders_taken: number;
  order_total: number;
  collections: number;
  collection_total: number;
  new_customers: number;
  complaints_resolved: number;
  objectives_met: string[];
  next_actions: string[];
}

// Location Tracking
export interface LocationTrack {
  id: string;
  salesperson_id: string;
  route_id?: string;
  location: GeoLocation;
  speed?: number; // km/h
  heading?: number; // degrees
  battery_level?: number;
  is_moving: boolean;
  recorded_at: string;
}

// Salesperson
export interface Salesperson {
  id: string;
  name: string;
  phone: string;
  email: string;
  employee_code: string;
  territory: string;
  is_active: boolean;
  last_location?: GeoLocation;
  last_seen?: string;
  current_route_id?: string;
}

// Route Optimization
export interface RouteOptimizationRequest {
  salesperson_id: string;
  date: string;
  customers: Array<{
    id: string;
    name: string;
    location: GeoLocation;
    priority: number;
    visit_type: VisitType;
  }>;
  start_location: GeoLocation;
  max_visits_per_day?: number;
  working_hours?: { start: string; end: string };
}

/**
 * Distance Calculator (Haversine formula)
 */
class DistanceCalculator {
  /**
   * Calculate distance between two points in meters
   */
  static calculate(loc1: GeoLocation, loc2: GeoLocation): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (loc1.latitude * Math.PI) / 180;
    const phi2 = (loc2.latitude * Math.PI) / 180;
    const deltaPhi = ((loc2.latitude - loc1.latitude) * Math.PI) / 180;
    const deltaLambda = ((loc2.longitude - loc1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

/**
 * Route Optimizer (Nearest Neighbor Algorithm)
 */
class RouteOptimizer {
  optimize(request: RouteOptimizationRequest): PlannedVisit[] {
    const { customers, start_location } = request;
    const visits: PlannedVisit[] = [];
    const unvisited = [...customers];
    let currentLocation = start_location;
    let sequence = 1;

    while (unvisited.length > 0) {
      // Find nearest customer
      let nearestIndex = 0;
      let minDistance = Infinity;

      unvisited.forEach((customer, index) => {
        const distance = DistanceCalculator.calculate(
          currentLocation,
          customer.location
        );

        // Factor in priority (higher priority = artificially closer)
        const adjustedDistance = distance / (customer.priority || 1);

        if (adjustedDistance < minDistance) {
          minDistance = adjustedDistance;
          nearestIndex = index;
        }
      });

      const customer = unvisited[nearestIndex];

      visits.push({
        id: `visit-${Date.now()}-${sequence}`,
        route_id: '', // Will be set later
        customer_id: customer.id,
        customer_name: customer.name,
        customer_address: '',
        location: customer.location,
        sequence,
        estimated_duration: 30, // Default 30 minutes
        visit_type: customer.visit_type,
        objectives: [],
        status: 'PENDING'
      });

      currentLocation = customer.location;
      unvisited.splice(nearestIndex, 1);
      sequence++;
    }

    return visits;
  }
}

/**
 * Location Observer
 */
type LocationObserver = (track: LocationTrack) => void;

/**
 * Field Sales Service
 */
export class FieldSalesService {
  private routes: Map<string, SalesRoute> = new Map();
  private visits: Map<string, Visit> = new Map();
  private locationTracks: Map<string, LocationTrack[]> = new Map();
  private salespeople: Map<string, Salesperson> = new Map();
  private locationObservers: Map<string, LocationObserver[]> = new Map();
  private routeOptimizer: RouteOptimizer;

  constructor() {
    this.routeOptimizer = new RouteOptimizer();
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Mock salespeople
    const mockSalespeople: Salesperson[] = [
      {
        id: 'sp-001',
        name: 'Ahmet Yılmaz',
        phone: '0532 111 2233',
        email: 'ahmet@retailos.com',
        employee_code: 'SP001',
        territory: 'İstanbul Anadolu',
        is_active: true
      },
      {
        id: 'sp-002',
        name: 'Ayşe Kaya',
        phone: '0533 222 3344',
        email: 'ayse@retailos.com',
        employee_code: 'SP002',
        territory: 'İstanbul Avrupa',
        is_active: true
      }
    ];

    mockSalespeople.forEach(sp => this.salespeople.set(sp.id, sp));

    // Create mock route for today
    const today = new Date().toISOString().split('T')[0];
    
    const mockPlannedVisits: PlannedVisit[] = [
      {
        id: 'visit-1',
        route_id: '',
        customer_id: 'c1',
        customer_name: 'ABC Market',
        customer_address: 'Kadıköy, İstanbul',
        location: {
          latitude: 40.99,
          longitude: 29.03,
          accuracy: 10,
          timestamp: new Date().toISOString()
        },
        sequence: 1,
        estimated_duration: 30,
        visit_type: 'SALES',
        objectives: ['Yeni ürünleri tanıt', 'Sipariş al'],
        status: 'PENDING'
      },
      {
        id: 'visit-2',
        route_id: '',
        customer_id: 'c2',
        customer_name: 'XYZ Gıda',
        customer_address: 'Üsküdar, İstanbul',
        location: {
          latitude: 41.02,
          longitude: 29.01,
          accuracy: 10,
          timestamp: new Date().toISOString()
        },
        sequence: 2,
        estimated_duration: 45,
        visit_type: 'COLLECTION',
        objectives: ['Tahsilat yap', 'Stok kontrolü'],
        status: 'PENDING'
      },
      {
        id: 'visit-3',
        route_id: '',
        customer_id: 'c3',
        customer_name: 'DEF AVM',
        customer_address: 'Beşiktaş, İstanbul',
        location: {
          latitude: 41.04,
          longitude: 29.00,
          accuracy: 10,
          timestamp: new Date().toISOString()
        },
        sequence: 3,
        estimated_duration: 60,
        visit_type: 'SALES',
        objectives: ['Kampanya bilgisi ver', 'Yeni sipariş al'],
        status: 'PENDING'
      }
    ];

    // Create route for sp-001 (Ahmet Yılmaz)
    const mockRoute = this.createRoute('sp-001', today, mockPlannedVisits);
    
    console.log('Mock route created:', mockRoute.id);
  }

  /**
   * Create route
   */
  createRoute(
    salespersonId: string,
    date: string,
    plannedVisits: PlannedVisit[]
  ): SalesRoute {
    const route: SalesRoute = {
      id: `route-${Date.now()}`,
      name: `Rota ${date}`,
      salesperson_id: salespersonId,
      date,
      status: 'PLANNED',
      planned_visits: plannedVisits.map((v, index) => ({
        ...v,
        sequence: index + 1
      })),
      actual_distance: 0,
      planned_distance: this.calculateRouteDistance(plannedVisits)
    };

    // Set route_id for visits
    route.planned_visits.forEach(v => (v.route_id = route.id));

    this.routes.set(route.id, route);

    return route;
  }

  /**
   * Optimize route
   */
  optimizeRoute(request: RouteOptimizationRequest): SalesRoute {
    const optimizedVisits = this.routeOptimizer.optimize(request);

    return this.createRoute(
      request.salesperson_id,
      request.date,
      optimizedVisits
    );
  }

  /**
   * Start route
   */
  startRoute(routeId: string, location: GeoLocation): void {
    const route = this.routes.get(routeId);

    if (!route) {
      throw new Error('Route not found');
    }

    route.status = 'IN_PROGRESS';
    route.start_time = new Date().toISOString();
    route.start_location = location;

    // Update salesperson
    const salesperson = this.salespeople.get(route.salesperson_id);
    if (salesperson) {
      salesperson.current_route_id = routeId;
      salesperson.last_location = location;
      salesperson.last_seen = new Date().toISOString();
    }
  }

  /**
   * Complete route
   */
  completeRoute(routeId: string, location: GeoLocation): void {
    const route = this.routes.get(routeId);

    if (!route) {
      throw new Error('Route not found');
    }

    route.status = 'COMPLETED';
    route.end_time = new Date().toISOString();
    route.end_location = location;

    // Update salesperson
    const salesperson = this.salespeople.get(route.salesperson_id);
    if (salesperson) {
      salesperson.current_route_id = undefined;
    }
  }

  /**
   * Check in to visit
   */
  checkIn(
    plannedVisitId: string,
    salespersonId: string,
    location: GeoLocation,
    photos?: string[]
  ): Visit {
    const plannedVisit = this.findPlannedVisit(plannedVisitId);

    if (!plannedVisit) {
      throw new Error('Planned visit not found');
    }

    // Calculate distance from customer
    const distanceFromCustomer = DistanceCalculator.calculate(
      location,
      plannedVisit.location
    );

    const visit: Visit = {
      id: `visit-${Date.now()}`,
      planned_visit_id: plannedVisitId,
      route_id: plannedVisit.route_id,
      salesperson_id: salespersonId,
      customer_id: plannedVisit.customer_id,
      customer_name: plannedVisit.customer_name,
      visit_type: plannedVisit.visit_type,
      check_in_time: new Date().toISOString(),
      check_in_location: location,
      distance_from_customer: distanceFromCustomer,
      photos: photos || [],
      outcomes: {
        orders_taken: 0,
        order_total: 0,
        collections: 0,
        collection_total: 0,
        new_customers: 0,
        complaints_resolved: 0,
        objectives_met: [],
        next_actions: []
      },
      status: 'IN_PROGRESS'
    };

    this.visits.set(visit.id, visit);

    // Update planned visit status
    plannedVisit.status = 'IN_PROGRESS';

    return visit;
  }

  /**
   * Check out from visit
   */
  checkOut(
    visitId: string,
    location: GeoLocation,
    outcomes: Partial<VisitOutcome>,
    notes?: string,
    photos?: string[]
  ): Visit {
    const visit = this.visits.get(visitId);

    if (!visit) {
      throw new Error('Visit not found');
    }

    visit.check_out_time = new Date().toISOString();
    visit.check_out_location = location;
    visit.notes = notes;

    if (photos) {
      visit.photos.push(...photos);
    }

    // Calculate duration
    const checkInTime = new Date(visit.check_in_time).getTime();
    const checkOutTime = new Date(visit.check_out_time).getTime();
    visit.duration = Math.floor((checkOutTime - checkInTime) / 1000 / 60);

    // Update outcomes
    visit.outcomes = { ...visit.outcomes, ...outcomes };
    visit.status = 'COMPLETED';

    // Update planned visit
    if (visit.planned_visit_id) {
      const plannedVisit = this.findPlannedVisit(visit.planned_visit_id);
      if (plannedVisit) {
        plannedVisit.status = 'COMPLETED';
      }
    }

    return visit;
  }

  /**
   * Track location
   */
  trackLocation(salespersonId: string, location: GeoLocation, metadata?: {
    speed?: number;
    heading?: number;
    battery_level?: number;
  }): LocationTrack {
    const salesperson = this.salespeople.get(salespersonId);

    if (!salesperson) {
      throw new Error('Salesperson not found');
    }

    // Determine if moving (speed > 1 km/h)
    const isMoving = (metadata?.speed || 0) > 1;

    const track: LocationTrack = {
      id: `track-${Date.now()}`,
      salesperson_id: salespersonId,
      route_id: salesperson.current_route_id,
      location,
      speed: metadata?.speed,
      heading: metadata?.heading,
      battery_level: metadata?.battery_level,
      is_moving: isMoving,
      recorded_at: new Date().toISOString()
    };

    // Store track
    const tracks = this.locationTracks.get(salespersonId) || [];
    tracks.push(track);

    // Keep only last 1000 tracks per person
    if (tracks.length > 1000) {
      tracks.shift();
    }

    this.locationTracks.set(salespersonId, tracks);

    // Update salesperson
    salesperson.last_location = location;
    salesperson.last_seen = new Date().toISOString();

    // Notify observers
    this.notifyLocationObservers(salespersonId, track);

    return track;
  }

  /**
   * Subscribe to location updates
   */
  subscribeToLocation(salespersonId: string, observer: LocationObserver): () => void {
    const observers = this.locationObservers.get(salespersonId) || [];
    observers.push(observer);
    this.locationObservers.set(salespersonId, observers);

    // Return unsubscribe function
    return () => {
      const obs = this.locationObservers.get(salespersonId) || [];
      const index = obs.indexOf(observer);
      if (index > -1) {
        obs.splice(index, 1);
      }
    };
  }

  /**
   * Notify location observers
   */
  private notifyLocationObservers(salespersonId: string, track: LocationTrack): void {
    const observers = this.locationObservers.get(salespersonId) || [];
    observers.forEach(observer => observer(track));
  }

  /**
   * Get live locations
   */
  getLiveLocations(): Map<string, { salesperson: Salesperson; track?: LocationTrack }> {
    const result = new Map();

    this.salespeople.forEach((salesperson, id) => {
      const tracks = this.locationTracks.get(id);
      const latestTrack = tracks && tracks.length > 0 ? tracks[tracks.length - 1] : undefined;

      result.set(id, {
        salesperson,
        track: latestTrack
      });
    });

    return result;
  }

  /**
   * Get routes
   */
  getRoutes(salespersonId?: string, date?: string): SalesRoute[] {
    let routes = Array.from(this.routes.values());

    if (salespersonId) {
      routes = routes.filter(r => r.salesperson_id === salespersonId);
    }

    if (date) {
      routes = routes.filter(r => r.date === date);
    }

    return routes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Get visits
   */
  getVisits(routeId?: string, salespersonId?: string): Visit[] {
    let visits = Array.from(this.visits.values());

    if (routeId) {
      visits = visits.filter(v => v.route_id === routeId);
    }

    if (salespersonId) {
      visits = visits.filter(v => v.salesperson_id === salespersonId);
    }

    return visits.sort((a, b) => 
      new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime()
    );
  }

  /**
   * Get location history
   */
  getLocationHistory(salespersonId: string, from?: string, to?: string): LocationTrack[] {
    const tracks = this.locationTracks.get(salespersonId) || [];

    if (!from && !to) {
      return tracks;
    }

    return tracks.filter(track => {
      const time = new Date(track.recorded_at).getTime();
      const fromTime = from ? new Date(from).getTime() : 0;
      const toTime = to ? new Date(to).getTime() : Date.now();

      return time >= fromTime && time <= toTime;
    });
  }

  /**
   * Get salespeople
   */
  getSalespeople(activeOnly: boolean = true): Salesperson[] {
    const people = Array.from(this.salespeople.values());

    if (activeOnly) {
      return people.filter(p => p.is_active);
    }

    return people;
  }

  /**
   * Calculate route distance
   */
  private calculateRouteDistance(visits: PlannedVisit[]): number {
    if (visits.length < 2) return 0;

    let total = 0;

    for (let i = 0; i < visits.length - 1; i++) {
      total += DistanceCalculator.calculate(
        visits[i].location,
        visits[i + 1].location
      );
    }

    return total;
  }

  /**
   * Find planned visit
   */
  private findPlannedVisit(plannedVisitId: string): PlannedVisit | undefined {
    for (const route of this.routes.values()) {
      const visit = route.planned_visits.find(v => v.id === plannedVisitId);
      if (visit) return visit;
    }
    return undefined;
  }

  /**
   * Get route statistics
   */
  getRouteStatistics(routeId: string): {
    total_visits: number;
    completed_visits: number;
    pending_visits: number;
    total_orders: number;
    total_order_value: number;
    total_collections: number;
    total_collection_value: number;
    completion_rate: number;
  } {
    const route = this.routes.get(routeId);

    if (!route) {
      throw new Error('Route not found');
    }

    const visits = this.getVisits(routeId);

    const completed = visits.filter(v => v.status === 'COMPLETED');
    const totalOrders = completed.reduce((sum, v) => sum + v.outcomes.orders_taken, 0);
    const totalOrderValue = completed.reduce((sum, v) => sum + v.outcomes.order_total, 0);
    const totalCollections = completed.reduce((sum, v) => sum + v.outcomes.collections, 0);
    const totalCollectionValue = completed.reduce((sum, v) => sum + v.outcomes.collection_total, 0);

    return {
      total_visits: route.planned_visits.length,
      completed_visits: completed.length,
      pending_visits: route.planned_visits.length - completed.length,
      total_orders: totalOrders,
      total_order_value: totalOrderValue,
      total_collections: totalCollections,
      total_collection_value: totalCollectionValue,
      completion_rate: (completed.length / route.planned_visits.length) * 100
    };
  }
}

// Singleton instance
export const fieldSalesService = new FieldSalesService();

// Export utilities
export { DistanceCalculator };

// Export types
export type { 
  GeoLocation, SalesRoute, PlannedVisit, Visit, LocationTrack, 
  Salesperson, VisitOutcome, RouteOptimizationRequest 
};


