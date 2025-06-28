
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("No Stripe signature found");
    }

    const body = await req.text();
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeSecretKey || !webhookSecret) {
      throw new Error("Missing Stripe configuration");
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    console.log("Received webhook event:", event.type);

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      console.log("Processing checkout session:", session.id);
      console.log("Session metadata:", session.metadata);

      const jobId = session.metadata?.job_id;
      if (!jobId) {
        console.error("No job_id found in session metadata");
        return new Response("No job_id in metadata", { status: 400 });
      }

      // Initialize Supabase client with service role key
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Update job status to paid and set paid_at timestamp
      const { data: updatedJob, error: jobUpdateError } = await supabaseAdmin
        .from('jobs')
        .update({ 
          status: 'paid',
          paid_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .select('*')
        .single();

      if (jobUpdateError) {
        console.error("Error updating job status:", jobUpdateError);
        throw new Error("Failed to update job status");
      }

      console.log("Updated job status to paid for job:", jobId);

      // Trigger receipt generation
      try {
        console.log("Triggering receipt generation for job:", jobId);
        const receiptResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-receipt`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              jobId: jobId,
              sessionId: session.id,
              amountPaid: session.amount_total,
              paymentDate: new Date().toISOString()
            })
          }
        );

        if (!receiptResponse.ok) {
          console.error("Failed to generate receipt:", await receiptResponse.text());
        } else {
          console.log("Receipt generation triggered successfully");
        }
      } catch (receiptError) {
        console.error("Error triggering receipt generation:", receiptError);
        // Don't fail the webhook if receipt generation fails
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
