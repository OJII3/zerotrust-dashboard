resource "cloudflare_workers_custom_domain" "dashboard" {
  count = var.worker_custom_domain == null ? 0 : 1

  account_id = var.cloudflare_account_id
  hostname   = var.access_application_domain
  service    = coalesce(var.worker_custom_domain.service, "zerotrust-dashboard")
  zone_id    = var.worker_custom_domain.zone_id
  zone_name  = var.worker_custom_domain.zone_name
}
