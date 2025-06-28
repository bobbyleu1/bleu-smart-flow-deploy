import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ExternalLink, CheckCircle, Clock, Link, DollarSign, Building, Copy, Phone, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreateJobDialog } from "./CreateJobDialog";
import { sendSMSNotification, formatPaymentLinkSMS } from "@/utils/smsService";
import { ReceiptViewer } from "./ReceiptViewer";

interface Job {
  id: string;
  title: string;
  job_name: string | null;
  client_name: string | null;
  client_id: string;
  price: number;
  company_id: string | null;
  status: 'pending' | 'paid' | 'completed' | 'test' | null;
  payment_url: string | null;
  paid_at: string | null;
  created_at: string;
  description: string | null;
  scheduled_date: string;
  is_recurring: boolean | null;
  frequency: string | null;
  stripe_checkout_url: string | null;
  phone_number: string | null;
  updated_at: string;
  receipt_id: string | null;
}

interface UserProfile {
  company_id: string | null;
  is_demo?: boolean;
  stripe_connected?: boolean;
}

interface JobsTabProps {
  userProfile?: UserProfile | null;
  isDemoMode?: boolean;
}

export const JobsTab = ({ userProfile: propUserProfile, isDemoMode = false }: JobsTabProps) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(propUserProfile || null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'paid'>('pending');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [generatingLinks, setGeneratingLinks] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const fetchUserProfile = async () => {
    if (propUserProfile) {
      setUserProfile(propUserProfile);
      return propUserProfile;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('No authenticated user found');
      }

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('id, email, company_id, role, created_at, is_demo, stripe_connected')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user profile:', error);
        throw error;
      }

      if (!profileData) {
        console.log('Profile not found, creating new profile...');
        
        const newCompanyId = crypto.randomUUID();
        const newProfile = {
          id: user.id,
          email: user.email || '',
          company_id: newCompanyId,
          role: 'invoice_owner'
        };

        const { error: insertError } = await supabase
          .from('profiles')
          .insert([newProfile]);

        if (insertError) {
          console.error('Error creating profile:', insertError);
          throw insertError;
        }

        const createdProfile = { 
          company_id: newCompanyId,
          is_demo: user.email === "demo@smartinvoice.com",
          stripe_connected: false
        };
        setUserProfile(createdProfile);
        
        toast({
          title: "Profile Created",
          description: "Your profile has been set up successfully!",
        });
        
        return createdProfile;
      }

      const profileWithDefaults = {
        company_id: profileData.company_id,
        is_demo: profileData.is_demo || user.email === "demo@smartinvoice.com",
        stripe_connected: profileData.stripe_connected || false
      };

      setUserProfile(profileWithDefaults);
      return profileWithDefaults;
    } catch (error: any) {
      console.error('Failed to fetch user profile:', error);
      toast({
        title: "Error",
        description: "Failed to load user profile",
        variant: "destructive",
      });
      return null;
    }
  };

  const fetchJobs = async () => {
    console.log('Fetching jobs...');
    try {
      const profile = userProfile || await fetchUserProfile();
      
      if (!profile?.company_id) {
        console.log('No company_id found, skipping job fetch');
        setJobs([]);
        return;
      }

      console.log('Fetching jobs for company_id:', profile.company_id);

      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching jobs:', error);
        throw error;
      }
      
      console.log('Jobs fetched successfully:', data);
      
      // Type assertion to handle the status field
      const typedJobs = (data || []).map(job => ({
        ...job,
        status: job.status as 'pending' | 'paid' | 'completed' | 'test' | null
      })) as Job[];
      
      setJobs(typedJobs);
    } catch (error: any) {
      console.error('Failed to fetch jobs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch jobs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      const profile = await fetchUserProfile();
      if (profile) {
        await fetchJobs();
      } else {
        setLoading(false);
      }
    };
    
    initialize();
  }, [propUserProfile]);

  const generatePaymentLink = async (jobId: string) => {
    if (isDemoMode) {
      toast({
        title: "Demo Mode",
        description: "Payment links are disabled in demo mode",
        variant: "destructive",
      });
      return;
    }

    console.log('Generating payment link for job:', jobId);
    setGeneratingLinks(prev => new Set(prev).add(jobId));
    
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { jobId }
      });

      if (error) {
        console.error('Error generating payment link:', error);
        throw error;
      }

      console.log('Payment link generated successfully:', data);
      console.log('Generated payment URL:', data.url);

      if (data.success && data.url) {
        // Show success toast with the payment link and copy functionality
        toast({
          title: "Payment Link Generated!",
          description: (
            <div className="space-y-2">
              <p className="text-sm">Link created successfully</p>
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <code className="text-xs flex-1 break-all">{data.url}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.url);
                      toast({
                        title: "Copied!",
                        description: "Payment link copied to clipboard",
                      });
                    } catch (err) {
                      console.error('Failed to copy:', err);
                      toast({
                        title: "Copy Failed",
                        description: "Could not copy to clipboard",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="flex-shrink-0"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ),
          duration: 10000, // Show for 10 seconds
        });

        // Find the job to get phone number and details for SMS
        const job = jobs.find(j => j.id === jobId);
        
        if (job && job.phone_number) {
          console.log('Job has phone number, sending SMS notification');
          
          const smsMessage = formatPaymentLinkSMS(
            data.url,
            job.job_name || job.title,
            job.client_name || 'Valued Client',
            job.price
          );

          const smsResult = await sendSMSNotification({
            phoneNumber: job.phone_number,
            message: smsMessage,
            jobId: jobId
          });

          if (!smsResult.success) {
            toast({
              title: "SMS Failed",
              description: "Payment link generated but SMS could not be sent",
              variant: "destructive",
            });
          }
        }

        await fetchJobs();
      } else {
        throw new Error(data.error || "Failed to generate payment link");
      }
    } catch (error: any) {
      console.error('Failed to generate payment link:', error);
      toast({
        title: "Error generating link. Try again later or check job details.",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setGeneratingLinks(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  const copyPaymentLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Success",
        description: "Payment link copied to clipboard!",
      });
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive",
      });
    }
  };

  const copyJobId = async (jobId: string) => {
    try {
      await navigator.clipboard.writeText(jobId);
      toast({
        title: "Copied",
        description: "Job ID copied to clipboard!",
      });
    } catch (error) {
      console.error('Failed to copy job ID:', error);
      toast({
        title: "Error",
        description: "Failed to copy job ID",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-blue-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const pendingJobs = jobs.filter(job => job.status === 'pending' || job.status === 'test');
  const paidJobs = jobs.filter(job => job.status === 'paid' || job.status === 'completed');

  const JobCard = ({ job }: { job: Job }) => (
    <Card key={job.id} className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg truncate">{job.job_name || job.title}</CardTitle>
            <CardDescription className="mt-1 truncate">
              Client: {job.client_name}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2">
              <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 font-mono">
                {job.id.slice(0, 8)}...
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyJobId(job.id)}
                className="h-6 w-6 p-0"
              >
                <Copy className="w-3 h-3" />
              </Button>
              {job.phone_number && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Phone className="w-3 h-3" />
                  <span>{job.phone_number}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {getStatusIcon(job.status)}
            <Badge className={`${getStatusColor(job.status)} text-xs`}>
              {job.status === 'paid' ? '✅ Paid' : job.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold text-green-600">
          ${job.price.toFixed(2)}
        </div>
        {job.paid_at && (
          <div className="text-sm text-green-600 font-medium">
            ✅ Paid on {new Date(job.paid_at).toLocaleDateString()} at {new Date(job.paid_at).toLocaleTimeString()}
          </div>
        )}
        
        {job.status === 'paid' ? (
          <div className="space-y-2">
            <div className="text-sm text-green-600 font-medium">
              Payment completed
            </div>
            {job.receipt_id && (
              <ReceiptViewer 
                jobId={job.id} 
                receiptId={job.receipt_id}
                trigger={
                  <Button variant="outline" size="sm" className="w-full">
                    <FileText className="w-4 h-4 mr-2" />
                    View Receipt
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {job.payment_url || job.stripe_checkout_url ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(job.payment_url || job.stripe_checkout_url!, '_blank')}
                    className="flex-1 min-w-0"
                  >
                    <ExternalLink className="w-4 h-4 mr-1 flex-shrink-0" />
                    <span className="truncate">Open Link</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyPaymentLink(job.payment_url || job.stripe_checkout_url!)}
                    className="flex-shrink-0"
                  >
                    <Link className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded break-all">
                  {job.payment_url || job.stripe_checkout_url}
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => generatePaymentLink(job.id)}
                disabled={generatingLinks.has(job.id) || isDemoMode}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <DollarSign className="w-4 h-4 mr-1" />
                {generatingLinks.has(job.id) ? "Generating..." : 
                 isDemoMode ? "Demo Mode" : "Generate Payment Link"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return <div className="flex justify-center p-8">Loading jobs...</div>;
  }

  if (!userProfile?.company_id) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Jobs</h2>
          <p className="text-gray-600">Manage your service jobs and payments</p>
        </div>
        <Card className="p-12 text-center">
          <CardContent>
            <Building className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Company ID Required</h3>
            <p className="text-gray-600 mb-4">
              You need to generate a Company ID before you can create jobs.
            </p>
            <p className="text-sm text-gray-500">
              Go to the Account tab to generate your Company ID first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Jobs</h2>
          <p className="text-gray-600">Manage your service jobs and payments</p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)}
          className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Job
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'paid')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending Jobs ({pendingJobs.length})
          </TabsTrigger>
          <TabsTrigger value="paid" className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Paid Jobs ({paidJobs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {pendingJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>

          {pendingJobs.length === 0 && (
            <Card className="p-12 text-center">
              <CardContent>
                <p className="text-gray-500 mb-4">No pending jobs found</p>
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Job
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="paid" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {paidJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>

          {paidJobs.length === 0 && (
            <Card className="p-12 text-center">
              <CardContent>
                <p className="text-gray-500">No paid jobs yet</p>
                <p className="text-sm text-gray-400 mt-2">
                  Completed payments will appear here
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <CreateJobDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onJobCreated={fetchJobs}
        userProfile={userProfile}
        isDemoMode={isDemoMode}
      />
    </div>
  );
};
