import { createClient } from '@supabase/supabase-js';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function fetchRevenue() {
  try {
    await new Promise(resolve => setTimeout(resolve, 3000));

    const { data, error } = await supabase
      .from('revenue')
      .select('month, revenue')
      .order('month');

    if (error) throw error;

    const formattedRevenue: Revenue[] = data.map(item => ({
      month: item.month,
      revenue: Number(item.revenue)
    }));

    return formattedRevenue;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        amount,
        id,
        customer_id,
        date
      `)
      .order('date', { ascending: false })
      .limit(5);

    if (error) throw error;

    // Fetch customer details for these invoices
    const customerIds = data.map(invoice => invoice.customer_id);
    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .select('id, name, email, image_url')
      .in('id', customerIds);

    if (customersError) throw customersError;

    // Combine invoice and customer data
    const latestInvoices = data.map(invoice => {
      const customer = customersData.find(c => c.id === invoice.customer_id);
      return {
        ...invoice,
        amount: formatCurrency(invoice.amount),
        name: customer?.name || '',
        email: customer?.email || '',
        image_url: customer?.image_url || '',
      };
    });
    
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    const [
      invoiceCountPromise,
      customerCountPromise,
      paidInvoicesPromise,
      pendingInvoicesPromise
    ] = await Promise.all([
      supabase.from('invoices').select('*', { count: 'exact' }),
      supabase.from('customers').select('*', { count: 'exact' }),
      supabase.from('invoices').select('amount').eq('status', 'paid'),
      supabase.from('invoices').select('amount').eq('status', 'pending')
    ]);

    const numberOfInvoices = invoiceCountPromise.count ?? 0;
    const numberOfCustomers = customerCountPromise.count ?? 0;
    const totalPaidInvoices = paidInvoicesPromise.data?.reduce((acc, invoice) => acc + invoice.amount, 0) ?? 0;
    const totalPendingInvoices = pendingInvoicesPromise.data?.reduce((acc, invoice) => acc + invoice.amount, 0) ?? 0;

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices: formatCurrency(totalPaidInvoices),
      totalPendingInvoices: formatCurrency(totalPendingInvoices),
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
// TypeScript Interface Update
interface Invoice {
  id: string; // UUIDs are represented as strings
  amount: number;
  date: string; // or Date, depending on how you handle dates
  status: string;
  name: string;
  email: string;
  image_url: string;
}

// In your fetchFilteredInvoices function
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
): Promise<Invoice[]> {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const { data, error } = await supabase.rpc('fetch_filtered_invoices', {
      query_text: query,
      limit_num: ITEMS_PER_PAGE,
      offset_num: offset,
    });

    if (error) {
      console.error('Supabase RPC Error:', error);
      throw error;
    }

    // Map the data to match your application's expected format
    const invoices: Invoice[] = data.map((invoice) => ({
      id: invoice.id,
      amount: parseFloat(invoice.amount), // Ensure amount is a number
      date: invoice.date,
      status: invoice.status,
      name: invoice.name,
      email: invoice.email,
      image_url: invoice.image_url,
    }));

    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const { data, error } = await supabase.rpc('fetch_invoices_pages_count', {
      query_text: query,
    });

    if (error) {
      console.error('Supabase RPC Error:', error);
      throw error;
    }

    const count = data; // Assuming data is the count value directly

    const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        customers!customer_id (
          name,
          email,
          image_url
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      ...data,
      amount: formatCurrency(data.amount),
      name: data.customers.name,
      email: data.customers.email,
      image_url: data.customers.image_url,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name')
      .order('name');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select(`
        id,
        name,
        email,
        image_url,
        total_invoices,
        total_pending,
        total_paid
      `)
      .or(`name.ilike.%${query}%, email.ilike.%${query}%`)
      .order('name');

    if (error) throw error;

    const customers = data.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer table.');
  }
}
