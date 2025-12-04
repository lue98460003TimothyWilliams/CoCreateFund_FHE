// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CoCreateFundFHE is SepoliaConfig {
    struct EncryptedProject {
        uint256 id;
        euint32 encryptedTitle;       // Encrypted project title
        euint32 encryptedDescription; // Encrypted project description
        euint32 encryptedLocation;    // Encrypted location identifier
        euint32 encryptedBudget;      // Encrypted requested budget
        euint32 totalContributions;   // Encrypted total contributions
        uint256 creationTime;
        bool isActive;
    }
    
    struct Contribution {
        address contributor;
        euint32 encryptedAmount;
        uint256 timestamp;
    }
    
    // Project state after reveal
    struct DecryptedProject {
        string title;
        string description;
        string location;
        uint256 budget;
        uint256 totalContributions;
        bool isRevealed;
    }
    
    // Contract state
    uint256 public projectCount;
    mapping(uint256 => EncryptedProject) public encryptedProjects;
    mapping(uint256 => DecryptedProject) public decryptedProjects;
    mapping(uint256 => Contribution[]) public projectContributions;
    
    // Quadratic funding calculations
    mapping(address => euint32) private encryptedSqrtContributions;
    mapping(uint256 => euint32) private encryptedProjectSqrtSum;
    
    // Decryption requests tracking
    mapping(uint256 => uint256) private requestToProjectId;
    
    // Events
    event ProjectSubmitted(uint256 indexed id, uint256 timestamp);
    event ContributionMade(uint256 indexed projectId, address indexed contributor);
    event FundingCompleted(uint256 indexed projectId);
    event ProjectRevealed(uint256 indexed id);
    
    modifier onlyCreator(uint256 projectId) {
        // Access control logic placeholder
        _;
    }
    
    modifier activeProject(uint256 projectId) {
        require(encryptedProjects[projectId].isActive, "Project not active");
        _;
    }
    
    /// @notice Submit a new encrypted project proposal
    function submitEncryptedProject(
        euint32 encryptedTitle,
        euint32 encryptedDescription,
        euint32 encryptedLocation,
        euint32 encryptedBudget
    ) public {
        projectCount += 1;
        uint256 newId = projectCount;
        
        encryptedProjects[newId] = EncryptedProject({
            id: newId,
            encryptedTitle: encryptedTitle,
            encryptedDescription: encryptedDescription,
            encryptedLocation: encryptedLocation,
            encryptedBudget: encryptedBudget,
            totalContributions: FHE.asEuint32(0),
            creationTime: block.timestamp,
            isActive: true
        });
        
        // Initialize decrypted state
        decryptedProjects[newId] = DecryptedProject({
            title: "",
            description: "",
            location: "",
            budget: 0,
            totalContributions: 0,
            isRevealed: false
        });
        
        emit ProjectSubmitted(newId, block.timestamp);
    }
    
    /// @notice Contribute to a project with encrypted amount
    function contributeToProject(
        uint256 projectId, 
        euint32 encryptedAmount
    ) public payable activeProject(projectId) {
        EncryptedProject storage project = encryptedProjects[projectId];
        
        // Update project total contributions
        project.totalContributions = FHE.add(project.totalContributions, encryptedAmount);
        
        // Record individual contribution
        projectContributions[projectId].push(Contribution({
            contributor: msg.sender,
            encryptedAmount: encryptedAmount,
            timestamp: block.timestamp
        }));
        
        // Update quadratic funding calculations
        euint32 sqrtAmount = FHE.sqrt(encryptedAmount);
        encryptedProjectSqrtSum[projectId] = FHE.add(
            encryptedProjectSqrtSum[projectId], 
            sqrtAmount
        );
        
        // Update contributor's sqrt sum
        if (!FHE.isInitialized(encryptedSqrtContributions[msg.sender])) {
            encryptedSqrtContributions[msg.sender] = FHE.asEuint32(0);
        }
        encryptedSqrtContributions[msg.sender] = FHE.add(
            encryptedSqrtContributions[msg.sender],
            sqrtAmount
        );
        
        emit ContributionMade(projectId, msg.sender);
    }
    
    /// @notice Complete funding period and calculate matching
    function completeFunding(uint256 projectId) public onlyCreator(projectId) activeProject(projectId) {
        encryptedProjects[projectId].isActive = false;
        emit FundingCompleted(projectId);
    }
    
    /// @notice Request project details decryption
    function requestProjectDecryption(uint256 projectId) public onlyCreator(projectId) {
        EncryptedProject storage project = encryptedProjects[projectId];
        require(!decryptedProjects[projectId].isRevealed, "Already revealed");
        
        // Prepare encrypted data for decryption
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(project.encryptedTitle);
        ciphertexts[1] = FHE.toBytes32(project.encryptedDescription);
        ciphertexts[2] = FHE.toBytes32(project.encryptedLocation);
        ciphertexts[3] = FHE.toBytes32(project.encryptedBudget);
        
        // Request decryption
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptProject.selector);
        requestToProjectId[reqId] = projectId;
    }
    
    /// @notice Callback for decrypted project data
    function decryptProject(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 projectId = requestToProjectId[requestId];
        require(projectId != 0, "Invalid request");
        
        EncryptedProject storage eProject = encryptedProjects[projectId];
        DecryptedProject storage dProject = decryptedProjects[projectId];
        require(!dProject.isRevealed, "Already revealed");
        
        // Verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted values
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dProject.title = results[0];
        dProject.description = results[1];
        dProject.location = results[2];
        dProject.budget = abi.decode(results[3], (uint256));
        dProject.isRevealed = true;
        
        emit ProjectRevealed(projectId);
    }
    
    /// @notice Calculate quadratic funding matching
    function calculateMatching(uint256 projectId) public view returns (euint32) {
        require(!encryptedProjects[projectId].isActive, "Funding still active");
        
        // Quadratic funding formula: (sum(sqrt(contributions)))^2
        return FHE.mul(
            encryptedProjectSqrtSum[projectId],
            encryptedProjectSqrtSum[projectId]
        );
    }
    
    /// @notice Get encrypted project details
    function getEncryptedProject(uint256 projectId) public view returns (
        euint32 encryptedTitle,
        euint32 encryptedDescription,
        euint32 encryptedLocation,
        euint32 encryptedBudget,
        euint32 totalContributions
    ) {
        EncryptedProject storage p = encryptedProjects[projectId];
        return (
            p.encryptedTitle,
            p.encryptedDescription,
            p.encryptedLocation,
            p.encryptedBudget,
            p.totalContributions
        );
    }
    
    /// @notice Get decrypted project details
    function getDecryptedProject(uint256 projectId) public view returns (
        string memory title,
        string memory description,
        string memory location,
        uint256 budget,
        uint256 totalContributions,
        bool isRevealed
    ) {
        DecryptedProject storage p = decryptedProjects[projectId];
        return (
            p.title,
            p.description,
            p.location,
            p.budget,
            p.totalContributions,
            p.isRevealed
        );
    }
}