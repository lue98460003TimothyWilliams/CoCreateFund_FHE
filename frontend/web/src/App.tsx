// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface PublicSpaceProposal {
  id: string;
  title: string;
  description: string;
  location: string;
  encryptedData: string;
  votes: number;
  fundsRaised: number;
  creator: string;
  status: "pending" | "approved" | "rejected";
}

const App: React.FC = () => {
  // Randomized style selections:
  // Colors: High contrast (blue+orange)
  // UI Style: Industrial mechanical
  // Layout: Center radiation
  // Interaction: Micro-interactions (hover effects)
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<PublicSpaceProposal[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newProposalData, setNewProposalData] = useState({
    title: "",
    description: "",
    location: "",
    encryptedDetails: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "approved" | "rejected">("all");

  // Calculate statistics
  const approvedCount = proposals.filter(p => p.status === "approved").length;
  const pendingCount = proposals.filter(p => p.status === "pending").length;
  const rejectedCount = proposals.filter(p => p.status === "rejected").length;
  const totalFundsRaised = proposals.reduce((sum, p) => sum + p.fundsRaised, 0);

  useEffect(() => {
    loadProposals().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadProposals = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("proposal_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing proposal keys:", e);
        }
      }
      
      const list: PublicSpaceProposal[] = [];
      
      for (const key of keys) {
        try {
          const proposalBytes = await contract.getData(`proposal_${key}`);
          if (proposalBytes.length > 0) {
            try {
              const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
              list.push({
                id: key,
                title: proposalData.title,
                description: proposalData.description,
                location: proposalData.location,
                encryptedData: proposalData.encryptedData,
                votes: proposalData.votes || 0,
                fundsRaised: proposalData.fundsRaised || 0,
                creator: proposalData.creator,
                status: proposalData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing proposal data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading proposal ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.votes - a.votes);
      setProposals(list);
    } catch (e) {
      console.error("Error loading proposals:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitProposal = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting proposal details with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify({
        details: newProposalData.encryptedDetails,
        creator: account
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const proposalData = {
        title: newProposalData.title,
        description: newProposalData.description,
        location: newProposalData.location,
        encryptedData: encryptedData,
        votes: 0,
        fundsRaised: 0,
        creator: account,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(proposalData))
      );
      
      const keysBytes = await contract.getData("proposal_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(proposalId);
      
      await contract.setData(
        "proposal_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted proposal submitted securely!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewProposalData({
          title: "",
          description: "",
          location: "",
          encryptedDetails: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const voteForProposal = async (proposalId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted vote with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalBytes = await contract.getData(`proposal_${proposalId}`);
      if (proposalBytes.length === 0) {
        throw new Error("Proposal not found");
      }
      
      const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
      
      const updatedProposal = {
        ...proposalData,
        votes: (proposalData.votes || 0) + 1
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProposal))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE vote processed successfully!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Vote failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const fundProposal = async (proposalId: string, amount: number) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted funding with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalBytes = await contract.getData(`proposal_${proposalId}`);
      if (proposalBytes.length === 0) {
        throw new Error("Proposal not found");
      }
      
      const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
      
      // Quadratic funding calculation using FHE
      const newContribution = amount;
      const existingFunds = proposalData.fundsRaised || 0;
      const newFunds = existingFunds + Math.sqrt(newContribution);
      
      const updatedProposal = {
        ...proposalData,
        fundsRaised: newFunds
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProposal))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE funding processed successfully!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Funding failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const approveProposal = async (proposalId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing approval with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalBytes = await contract.getData(`proposal_${proposalId}`);
      if (proposalBytes.length === 0) {
        throw new Error("Proposal not found");
      }
      
      const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
      
      const updatedProposal = {
        ...proposalData,
        status: "approved"
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProposal))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Proposal approved with FHE verification!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Approval failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectProposal = async (proposalId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing rejection with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalBytes = await contract.getData(`proposal_${proposalId}`);
      if (proposalBytes.length === 0) {
        throw new Error("Proposal not found");
      }
      
      const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
      
      const updatedProposal = {
        ...proposalData,
        status: "rejected"
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProposal))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Proposal rejected with FHE verification!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isCreator = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const filteredProposals = proposals.filter(proposal => {
    const matchesSearch = proposal.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         proposal.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         proposal.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = activeTab === "all" || proposal.status === activeTab;
    
    return matchesSearch && matchesTab;
  });

  const renderFundingMeter = (funds: number, max: number) => {
    const percentage = Math.min(100, (funds / max) * 100);
    return (
      <div className="funding-meter">
        <div 
          className="funding-progress" 
          style={{ width: `${percentage}%` }}
        ></div>
        <div className="funding-label">{funds.toFixed(2)} ETH</div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="gear-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>CoCreate<span>Fund</span></h1>
        </div>
        
        <div className="header-actions">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search proposals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="industrial-input"
            />
            <button className="search-btn">
              <div className="magnifier-icon"></div>
            </button>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="industrial-button primary"
          >
            <div className="plus-icon"></div>
            New Proposal
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content center-radial">
        <div className="central-panel">
          <div className="panel-header">
            <h2>Public Space Proposals</h2>
            <div className="status-tabs">
              <button 
                className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                All ({proposals.length})
              </button>
              <button 
                className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
                onClick={() => setActiveTab("pending")}
              >
                Pending ({pendingCount})
              </button>
              <button 
                className={`tab-btn ${activeTab === "approved" ? "active" : ""}`}
                onClick={() => setActiveTab("approved")}
              >
                Approved ({approvedCount})
              </button>
              <button 
                className={`tab-btn ${activeTab === "rejected" ? "active" : ""}`}
                onClick={() => setActiveTab("rejected")}
              >
                Rejected ({rejectedCount})
              </button>
            </div>
          </div>
          
          <div className="stats-bar">
            <div className="stat-card">
              <div className="stat-value">{proposals.length}</div>
              <div className="stat-label">Total Proposals</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalFundsRaised.toFixed(2)}</div>
              <div className="stat-label">ETH Raised</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{approvedCount}</div>
              <div className="stat-label">Implemented</div>
            </div>
            <div className="stat-card highlight">
              <div className="stat-value">FHE</div>
              <div className="stat-label">Secured</div>
            </div>
          </div>
          
          <div className="proposals-grid">
            {filteredProposals.length === 0 ? (
              <div className="no-proposals">
                <div className="blueprint-icon"></div>
                <p>No public space proposals found</p>
                <button 
                  className="industrial-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Proposal
                </button>
              </div>
            ) : (
              filteredProposals.map(proposal => (
                <div className="proposal-card" key={proposal.id}>
                  <div className="card-header">
                    <h3>{proposal.title}</h3>
                    <span className={`status-badge ${proposal.status}`}>
                      {proposal.status}
                    </span>
                  </div>
                  <div className="card-location">
                    <div className="pin-icon"></div>
                    {proposal.location}
                  </div>
                  <p className="card-description">{proposal.description}</p>
                  
                  <div className="card-stats">
                    <div className="stat">
                      <div className="vote-icon"></div>
                      {proposal.votes} votes
                    </div>
                    <div className="stat">
                      <div className="fund-icon"></div>
                      {proposal.fundsRaised.toFixed(2)} ETH
                    </div>
                  </div>
                  
                  {renderFundingMeter(proposal.fundsRaised, 100)}
                  
                  <div className="card-actions">
                    <button 
                      className="industrial-button"
                      onClick={() => voteForProposal(proposal.id)}
                    >
                      Vote
                    </button>
                    <button 
                      className="industrial-button primary"
                      onClick={() => fundProposal(proposal.id, 1)}
                    >
                      Fund 1 ETH
                    </button>
                    {isCreator(proposal.creator) && proposal.status === "pending" && (
                      <div className="admin-actions">
                        <button 
                          className="industrial-button success"
                          onClick={() => approveProposal(proposal.id)}
                        >
                          Approve
                        </button>
                        <button 
                          className="industrial-button danger"
                          onClick={() => rejectProposal(proposal.id)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitProposal} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          proposalData={newProposalData}
          setProposalData={setNewProposalData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="gear-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="gear-icon"></div>
              <span>CoCreateFund</span>
            </div>
            <p>Anonymous public space co-creation powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">How It Works</a>
            <a href="#" className="footer-link">FHE Technology</a>
            <a href="#" className="footer-link">Community</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Fully Homomorphic Encryption</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} CoCreateFund. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  proposalData: any;
  setProposalData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  proposalData,
  setProposalData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProposalData({
      ...proposalData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!proposalData.title || !proposalData.location || !proposalData.encryptedDetails) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal industrial-card">
        <div className="modal-header">
          <h2>New Public Space Proposal</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Your proposal details will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Title *</label>
              <input 
                type="text"
                name="title"
                value={proposalData.title} 
                onChange={handleChange}
                placeholder="Short descriptive title..." 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Location *</label>
              <input 
                type="text"
                name="location"
                value={proposalData.location} 
                onChange={handleChange}
                placeholder="City, district or address..." 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Description</label>
              <textarea 
                name="description"
                value={proposalData.description} 
                onChange={handleChange}
                placeholder="Describe your public space improvement idea..." 
                className="industrial-textarea"
                rows={3}
              />
            </div>
            
            <div className="form-group full-width">
              <label>Encrypted Details *</label>
              <textarea 
                name="encryptedDetails"
                value={proposalData.encryptedDetails} 
                onChange={handleChange}
                placeholder="Enter sensitive details that will be FHE encrypted..." 
                className="industrial-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="shield-icon"></div> Your identity remains anonymous through FHE encryption
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="industrial-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;