import { mkParty } from "./mock-builders";

// Client party objects
export const P_RELIANCE  = mkParty("Reliance Retail Ltd", "27AAACR5055K1ZJ", "AAACR5055K", "3rd Floor, Court House, Lokmanya Tilak Marg", "Mumbai", "Maharashtra", "27", "+91 22 4477 0000", "gst@relianceretail.com", true);
export const P_TATA      = mkParty("Tata Motors Pvt Ltd", "27AAACD1990F1Z7", "AAACD1990F", "Bombay House, 24 Homi Mody Street", "Mumbai", "Maharashtra", "27", "+91 22 6665 8282", "finance@tatamotors.com", true);
export const P_HDFC      = mkParty("HDFC Securities Ltd", "27AABCH8759A1ZR", "AABCH8759A", "I Think Techno Campus, Goregaon East", "Mumbai", "Maharashtra", "27", "+91 22 3901 9400", "accounts@hdfcsec.com", true);
export const P_INFOSYS   = mkParty("Infosys Limited", "29AABCI1681G1ZK", "AABCI1681G", "Electronics City, Hosur Road", "Bengaluru", "Karnataka", "29", "+91 80 2852 0261", "gst@infosys.com", true);
export const P_ITC       = mkParty("ITC Limited", "19AAACI1223B1ZH", "AAACI1223B", "Virginia House, 37 JNR Road", "Kolkata", "West Bengal", "19", "+91 33 2288 9371", "gst@itcportal.com", true);

// Counter-party objects
export const P_FUTURE    = mkParty("Future Retail Ltd", "27AABCF5474H1ZI", "AABCF5474H", "LBS Marg, Kurla West", "Mumbai", "Maharashtra", "27", "+91 22 4045 8400", "vendor@futureretail.in", true);
export const P_SIEMENS   = mkParty("Siemens Ltd", "27AAICS2127K1ZI", "AAICS2127K", "Worli Naka, Dr Annie Besant Road", "Mumbai", "Maharashtra", "27", "+91 22 3967 7000", "gst@siemens.com", true);
export const P_FORD      = mkParty("Ford India Pvt Ltd", "33AABCF8999H1ZM", "AABCF8999H", "SPL Building, Maraimalai Nagar", "Chennai", "Tamil Nadu", "33", "+91 44 4747 5000", "accounts@fordindia.com", true);
export const P_BLOOMBERG = mkParty("Bloomberg Data Services", "", "AABCB2122F", "DLF Cyber City, Phase II", "Gurugram", "Haryana", "06", "+91 124 469 2000", "invoices@bloomberg.com", false);
export const P_BAJAJ     = mkParty("Bajaj Finance Ltd", "27AAACB2918C1ZK", "AAACB2918C", "Viman Nagar, Pune-Nagar Road", "Pune", "Maharashtra", "27", "+91 20 3957 5152", "gst@bajajfinance.in", true);
export const P_ACCENTURE = mkParty("Accenture Solutions Pvt Ltd", "29AABCA4370J1Z0", "AABCA4370J", "Prestige Shantiniketan, ITPL Main Road", "Bengaluru", "Karnataka", "29", "+91 80 4193 6000", "ap@accenture.com", true);
export const P_MSFT      = mkParty("Microsoft Corporation India", "27AABCM3025E1ZD", "AABCM3025E", "Embassy GolfLinks Business Park", "Bengaluru", "Karnataka", "29", "+91 80 4046 0000", "gst@microsoft.com", true);
export const P_SPENCERS  = mkParty("Spencer's Retail Ltd", "19AABCS5809K1ZE", "AABCS5809K", "Duncan House, 31 Netaji Subhash Road", "Kolkata", "West Bengal", "19", "+91 33 4011 0100", "gst@spencersretail.com", true);
export const P_EMPTY     = mkParty("", "", "", "", "", "", "", "", "", false);
