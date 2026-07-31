/**
 * Restoran işletme tipinde giriş sonrası bir kez Restoran ekranına yönlendirme.
 * Oturum bayrağı — logout ile sıfırlanır; backoffice menüleri erişilebilir kalır.
 */

let restaurantLandingConsumed = false;

export function tryConsumeRestaurantLanding(): boolean {
  if (restaurantLandingConsumed) return false;
  restaurantLandingConsumed = true;
  return true;
}

export function resetRestaurantLandingSession(): void {
  restaurantLandingConsumed = false;
}
