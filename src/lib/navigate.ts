"use client";

type RouterLike = { push: (href: string) => void };

export function appNavigate(router: RouterLike, page: string, params: Record<string, string> = {}) {
  switch (page) {
    case "dashboard":
      router.push("/");
      break;
    case "houses":
      router.push("/houses");
      break;
    case "house-detail":
      router.push(`/houses/${params.houseId}`);
      break;
    case "room-detail":
      router.push(`/houses/${params.houseId}/rooms/${params.roomId}`);
      break;
    case "bookings":
      router.push("/bookings");
      break;
    case "booking-new": {
      const q = new URLSearchParams(params).toString();
      router.push(`/bookings/new${q ? `?${q}` : ""}`);
      break;
    }
    case "booking-detail": {
      const q = new URLSearchParams();
      if (params.addPurchase) q.set("addPurchase", params.addPurchase);
      const qs = q.toString();
      router.push(`/bookings/${params.bookingId}${qs ? `?${qs}` : ""}`);
      break;
    }
    case "customers":
      router.push("/customers");
      break;
    case "customer-detail":
      router.push(`/customers/${params.customerId}`);
      break;
    case "catalogue":
      router.push("/catalogue");
      break;
    case "purchases":
      router.push("/purchases");
      break;
    case "companies":
      router.push("/companies");
      break;
    case "staff":
      router.push("/staff");
      break;
    case "bill":
    case "public-bill":
      router.push(`/bill/${params.token || params.bookingId}`);
      break;
    default:
      router.push(`/${page}`);
  }
}
