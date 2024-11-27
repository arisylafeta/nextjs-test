'use server';
import {z} from 'zod';
import { supabase } from './data';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
 
const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
        invalid_type_error: "Please select a customer.",
    }),
    amount: z.coerce
    .number()
    .gt(0, {message: "please enter an amount greater than 0."}),
    status: z.enum(['pending', 'paid'], {
        invalid_type_error: "Please select an invoice status.",
    }),
    date: z.string(),
})

const UpdateInvoice = FormSchema.omit({ id: true, date: true});
const CreateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
    errors?: {
        customerId?: string[],
        amount?: string[],
        status?: string[],
    };
    message? : string | null;
}

export async function createInvoice(prevState: State, formData: FormData) {
    // Validate form using Zod
    const validatedFields = CreateInvoice.safeParse({
      customerId: formData.get('customerId'),
      amount: formData.get('amount'),
      status: formData.get('status'),
    });
   
    // If form validation fails, return errors early. Otherwise, continue.
    if (!validatedFields.success) {
      return {
        errors: validatedFields.error.flatten().fieldErrors,
        message: 'Missing Fields. Failed to Create Invoice.',
      };
    }
   
    // Prepare data for insertion into the database
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];
   
    // Insert data into the database
    try {
      await supabase.from('invoices').insert({
        customer_id: customerId,
        amount: amountInCents,
        status,
        date,
      });
    } catch (error) {
      // If a database error occurs, return a more specific error.
      return {
        message: 'Database Error: Failed to Create Invoice.',
      };
    }
   
    // Revalidate the cache for the invoices page and redirect the user.
    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
  }
  
  
export async function updateInvoice(prevState: State, formData: FormData) {
    const id = formData.get('id') as string;
    const validatedFields = UpdateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Update Invoice.',
        };
    }

    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;

    try {
        const { error } = await supabase
            .from('invoices')
            .update({
                customer_id: customerId,
                amount: amountInCents,
                status,
            })
            .eq('id', id);

        if (error) {
            return {
                message: 'Database Error: Failed to Update Invoice.',
            };
        }
    } catch (error) {
        return {
            message: 'Database Error: Failed to Update Invoice.',
        };
    }
    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);
      
    if (error) {
      throw error;
    }

    
  } catch (error) {
    console.error('Error deleting invoice:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete invoice.');
  }
  revalidatePath('/dashboard/invoices');
}