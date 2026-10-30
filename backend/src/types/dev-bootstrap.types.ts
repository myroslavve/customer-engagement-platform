export type DevBootstrapInput = {
  email: string;
  password: string;
  accountName: string;
};

export type SignedIn = {
  accessToken: string;
  accountId: string;
};

/** Everything needed to call the admin API (accessToken) and the ingestion API (apiKey). */
export type DevBootstrapResult = {
  accountId: string;
  accessToken: string;
  apiKey: string;
  templateId: string;
  workflowId: string;
};
