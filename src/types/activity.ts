/**
 * Activity & Reservation Domain Interfaces
 */

export interface ActivityManager {
  first_name?: string;
  last_name?: string;
  type?: string;
  phone?: string;
  email?: string;
  company_name?: string;
  coba_client_number?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
}

export interface ReservationSlot {
  date: string;
  start_time: string;
  end_time: string;
}

export interface StaffRow {
  id?: string;
  salary_id?: string;
  hours?: number;
  rate_override?: number;
  tarif_id?: string;
}

export interface ServiceRow {
  id?: string;
  service_id?: string;
  tarif_id?: string;
  quantity?: number;
  amount_override?: number;
}

export interface OtherFeeRow {
  id?: string;
  description?: string;
  amount?: number;
  gl_account_code?: string;
}

export interface BarDrinkSale {
  drink_type?: string;
  quantity?: number;
  price_per_unit?: number;
  total?: number;
}

export interface BarRevenueRow {
  active?: boolean;
  drink_sales?: BarDrinkSale[];
  hostess_hours?: number;
  hostess_hourly_rate?: number;
  service_type?: string;
  duties?: string[];
}

export interface Reservation {
  id?: string;
  room_name: string;
  room_other_details?: string;
  slots: ReservationSlot[];
  tariff_id?: string;
  tariff_amount?: number;
  client_type?: string;
  staff?: StaffRow[];
  services?: ServiceRow[];
  other_fees?: OtherFeeRow[];
  bar_service?: BarRevenueRow;
  install_start?: string;
  dismantle_end?: string;
  notes?: string;
}

export interface DistributionRow {
  id?: string;
  account_code: string;
  amount: number;
  description?: string;
  reference?: string;
}

export interface SubmissionInfo {
  file_link_id?: string;
  generated_at?: string;
  sent_at?: string;
}

export interface ContractInfo {
  file_link_id?: string;
  approved_at?: string;
}

export interface FormLinkInfo {
  file_link_id?: string;
  linked_at?: string;
}

export interface SupportingDocsInfo {
  folder_link_id?: string;
  linked_at?: string;
}

export interface PlanningTaskItem {
  id?: string;
  description?: string;
  completed?: boolean;
  date_due?: string;
}

export interface TaxOverrideSetting {
  mode?: "rate" | "amount";
  value?: number;
  note?: string;
}

export interface TaxOverrides {
  tps?: TaxOverrideSetting;
  tvq?: TaxOverrideSetting;
}

export interface Activity {
  id: string;
  name: string;
  responsable?: string;
  responsable_first_name?: string;
  responsable_last_name?: string;
  responsable_same_as_manager?: boolean;
  attendees_count?: number;
  date_start: string;
  date_end: string;
  description?: string;
  coba?: string;
  activity_manager?: ActivityManager;
  client_type: string;
  responsable_address?: string;
  responsable_city?: string;
  responsable_province?: string;
  responsable_postal_code?: string;
  reservations: Reservation[];
  department: string;
  event_type?: string;
  event_type_other?: string;
  distributions: DistributionRow[];
  state: "brouillon" | "soumise" | "approuvee" | "planifiee" | "facturee" | "terminee" | string;
  mode?: string;
  submission?: SubmissionInfo;
  contract?: ContractInfo;
  form?: FormLinkInfo;
  supporting_docs?: SupportingDocsInfo;
  planning_tasks?: PlanningTaskItem[];
  billed_at?: string;
  completed_at?: string;
  notes?: string;
  tax_overrides?: TaxOverrides | null;
  non_taxable?: boolean;
  deleted?: boolean;
  bar_revenue_lines?: any[];
}
