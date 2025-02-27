'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/hooks/useUser';
import { useSocket } from '@/hooks/useSocket';

// Define available Nanos server versions
const NANOS_VERSIONS = [
  { 
    id: 'standard', 
    name: 'Stable (Recommended)', 
    version: '1.0.12',
    description: 'The latest stable release of Nanos World Server' 
  },
  { 
    id: 'bleeding-edge', 
    name: 'Bleeding Edge', 
    version: '1.1.0-dev',
    description: 'Latest development version with newest features and fixes' 
  }
];

// Installation directory that will be used across the app
export const NANOS_INSTALL_DIR = '/opt/nanos-world-server';

// Default server configuration
const DEFAULT_SERVER_CONFIG = `# discover configurations
[discover]
    # server name
    name =              "a great server"
    # server description (max 127 characters)
    description =       "nanos made easy"
    # server IP. we recommend leaving it 0.0.0.0 for default
    ip =                "0.0.0.0"
    # server port (TCP and UDP)
    port =              7777
    # query port (UDP)
    query_port =        7778
    # announce server in the master server list
    announce =          true
    # true if should run as dedicated server or false to run as P2P - dedicated server requires port forwarding and provides the fastest connection - P2P will provide a fake IP to be used to connect but connection can be slower
    dedicated_server =  true

# general configurations
[general]
    # max players
    max_players =       64
    # leave it blank for no password
    password =          ""
    # nanos world server authentication token
    token =             ""
    # banned nanos account IDs
    banned_ids = [

    ]

# game configurations
[game]
    # default startup map
    map =               "default-blank-map"
    # game-mode package to load (set the main game-mode package to load - you can load only one 'game-mode' package type at once)
    game_mode =         ""
    # packages list (set the packages you want to load)
    packages = [
    ]
    # asset packs list (additionally loads the asset packs you define here)
    assets = [

    ]
    # loading-screen package to load (the loading screen will be displayed when players join your server)
    loading_screen =    ""

# custom settings values
# those values can be accessed through Server.GetCustomSettings() method from any package
[custom_settings]
    # my_setting_example_01 = "value"
    # my_setting_example_02 = 123

# debug configurations
[debug]
    # log Level - (1) normal, (2) debug or (3) verbose
    log_level =         1
    # if to use async or sync logs (async provides better performance, disabling async logs can help debugging crashes)
    async_log =         true
    # enables performance profiling logs for debugging
    profiling =         false

# optimization configurations
[optimization]
    # server tick rate in milliseconds (dangerous! server will tick at each [tick_rate] ms, affecting both server and client performance. 33 ms means 30 ticks per second and is the default and recommended value)
    tick_rate =         33
    # sets the compression level to use in some networking operations (0 - 9) - (0) disables it, (1) is the fastest and (9) is the slowest but has the highest compression ratio
    compression =       0`;

// Onboarding steps
enum OnboardingStep {
  WELCOME = 0,
  VERSION_SELECT = 1,
  INSTALLATION = 2,
  COMPLETE = 3
}

export default function NanosOnboarding() {
  const { userData, updateOnboardingStatus } = useUser();
  const { executeCommand } = useSocket();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(OnboardingStep.WELCOME);
  const [selectedVersion, setSelectedVersion] = useState<string>(NANOS_VERSIONS[0].id);
  const [installationProgress, setInstallationProgress] = useState<number>(0);
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  const [installationLog, setInstallationLog] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Function to add log message
  const addLogMessage = useCallback((message: string) => {
    setInstallationLog(prev => [...prev, message]);
  }, []);
  
  // Function to handle next step
  const handleNextStep = () => {
    setCurrentStep(prev => {
      const nextStep = prev + 1;
      return nextStep <= OnboardingStep.COMPLETE ? nextStep : prev;
    });
  };
  
  // Function to handle previous step
  const handlePrevStep = () => {
    setCurrentStep(prev => {
      const prevStep = prev - 1;
      return prevStep >= OnboardingStep.WELCOME ? prevStep : prev;
    });
  };
  
  // Function to handle version selection
  const handleVersionSelect = (versionId: string) => {
    setSelectedVersion(versionId);
  };
  
  // Setup progress interpolation
  useEffect(() => {
    if (isInstalling) {
      // Create interval for interpolation
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prevDisplay => {
          // If display is close to target, don't interpolate further
          if (Math.abs(prevDisplay - installationProgress) < 0.2) {
            return installationProgress;
          }
          
          // Interpolate towards target
          return prevDisplay + (installationProgress - prevDisplay) * 0.05;
        });
      }, 50);
    } else if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isInstalling, installationProgress]);
  
  // Function to start installation
  const handleStartInstallation = async () => {
    setIsInstalling(true);
    addLogMessage('> Buckle up! We\'re about to launch your Nanos adventure! 🚀');
    addLogMessage(`> You chose the ${NANOS_VERSIONS.find(v => v.id === selectedVersion)?.name} flavor. Nice taste!`);
    
    try {
      setInstallationProgress(10);
      addLogMessage('> Installing some nerdy dependencies... 🤓');
      const installLib32 = await executeCommand('sudo apt-get install -y lib32gcc-s1 unzip');
      if (installLib32.error) {
        addLogMessage(`Oops! Something went wrong: ${installLib32.error}`);
        throw new Error(installLib32.error);
      }
      addLogMessage('> Dependencies acquired! Moving on to greater things!');

      setInstallationProgress(30);
      addLogMessage('> Creating a cozy home for your server... 🏠');
      const createDir = await executeCommand(`sudo mkdir -p ${NANOS_INSTALL_DIR}/steam`);
      if (createDir.error) {
        addLogMessage(`Hmm, we couldn't build that home: ${createDir.error}`);
        throw new Error(createDir.error);
      }
      
      const setPerms = await executeCommand(`sudo chown -R $USER:$USER ${NANOS_INSTALL_DIR}`);
      if (setPerms.error) {
        addLogMessage(`Permission denied! Even sudo couldn't help us: ${setPerms.error}`);
        throw new Error(setPerms.error);
      }
      addLogMessage('> Home sweet home created successfully!');

      setInstallationProgress(50);
      addLogMessage('> Teleporting to the installation directory... 🧙‍♂️');
      const cdCommand = await executeCommand(`cd ${NANOS_INSTALL_DIR}/steam`);
      if (cdCommand.error) {
        addLogMessage(`Teleportation failed: ${cdCommand.error}`);
        throw new Error(cdCommand.error);
      }

      addLogMessage('> Summoning the almighty SteamCMD from the internet... 🧩');
      const downloadSteam = await executeCommand('curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf -');
      if (downloadSteam.error) {
        addLogMessage(`Steam summoning ritual failed: ${downloadSteam.error}`);
        throw new Error(downloadSteam.error);
      }
      addLogMessage('> SteamCMD has answered our call!');

      setInstallationProgress(70);
      addLogMessage('> Now for the fun part: downloading gigabytes of data! ☕ Time for a coffee break...');
      
      // Determine the install command based on selected version
      const steamInstallCmd = selectedVersion === 'bleeding-edge' 
        ? `./steamcmd.sh +force_install_dir ${NANOS_INSTALL_DIR} +login anonymous "+app_update 1936830 -beta bleeding-edge" validate +quit`
        : `./steamcmd.sh +force_install_dir ${NANOS_INSTALL_DIR} +login anonymous +app_update 1936830 validate +quit`;
      
      const installServer = await executeCommand(steamInstallCmd);
      if (installServer.error) {
        addLogMessage(`Steam has betrayed us: ${installServer.error}`);
        throw new Error(installServer.error);
      }
      addLogMessage('> Download complete! Hope you enjoyed your coffee! ☕');

      setInstallationProgress(85);
      addLogMessage('> Writing a beautiful config file filled with possibilities... ✨');
      // Create Config.toml with default configuration
      const createConfig = await executeCommand(`echo '${DEFAULT_SERVER_CONFIG}' > ${NANOS_INSTALL_DIR}/Config.toml`);
      if (createConfig.error) {
        addLogMessage(`Couldn't write the config. My creative writing skills failed me: ${createConfig.error}`);
        throw new Error(createConfig.error);
      }
      addLogMessage('> Config masterpiece created! Shakespeare would be proud!');

      setInstallationProgress(90);
      addLogMessage('> Granting magical execution powers to your server... 🧙‍♂️');
      const makeExecutable = await executeCommand(`chmod +x ${NANOS_INSTALL_DIR}/NanosWorldServer.sh`);
      if (makeExecutable.error) {
        addLogMessage(`Failed to sprinkle the execution magic: ${makeExecutable.error}`);
        throw new Error(makeExecutable.error);
      }
      addLogMessage('> Magic powers granted!');

      setInstallationProgress(100);
      addLogMessage('> 🎉 Ta-da! Your server is ready to rock and roll! 🎸');
      addLogMessage(`> Your new baby is resting at: ${NANOS_INSTALL_DIR}`);
      addLogMessage('> Go forth and create amazing worlds! The Nanos universe awaits!');
      
      // Automatically mark onboarding as complete
      await updateOnboardingStatus(true);
      
      // Advance to completion step automatically
      setCurrentStep(OnboardingStep.COMPLETE);
      
    } catch (error) {
      addLogMessage(`> Oh no! We hit a bump in the road: ${(error as Error).message}`);
      addLogMessage('> Don\'t worry, not all heroes succeed on their first quest!');
      // Keep progress where it failed
    } finally {
      setIsInstalling(false);
    }
  };
  

  // Load config values when reaching configuration step
  useEffect(() => {
    // Configuration will be handled in the dashboard
  }, []);
  
  // Function to complete onboarding
  const handleCompleteOnboarding = async () => {
    // Navigate to dashboard or reload page
    window.location.reload();
  };
  
  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case OnboardingStep.WELCOME:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Welcome to Nanos World Server Manager</h3>
            <p className="text-gray-300">
              This wizard will guide you through the process of setting up your Nanos World Server.
              Follow the steps to install and configure your server.
            </p>
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={handleNextStep}
                className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
              >
                Next Step &gt;
              </button>
            </div>
          </div>
        );
        
      case OnboardingStep.VERSION_SELECT:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Select Nanos World Server Version</h3>
            <p className="text-gray-300 mb-4">
              Choose the version of Nanos World Server you want to install:
            </p>
            
            <div className="space-y-3">
              {NANOS_VERSIONS.map(version => (
                <button
                  type="button"
                  key={version.id}
                  onClick={() => handleVersionSelect(version.id)}
                  className={`w-full p-4 rounded-lg cursor-pointer transition-all text-left ${
                    selectedVersion === version.id
                      ? 'bg-amber-500/20 border border-amber-500/50'
                      : 'hover:bg-black/30 border border-amber-500/10'
                  }`}
                >
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full mr-3 ${
                      selectedVersion === version.id ? 'bg-amber-400' : 'bg-gray-600'
                    }`} />
                    <div>
                      <div className="font-mono text-amber-300">{version.name} <span className="text-xs text-amber-500/70">v{version.version}</span></div>
                      <div className="text-sm text-gray-400">{version.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono"
              >
                &lt; Back
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
              >
                Next Step &gt;
              </button>
            </div>
          </div>
        );
        
      case OnboardingStep.INSTALLATION:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Installing Nanos World Server</h3>
            
            <div className="font-mono text-sm">
              <div className="h-64 overflow-y-auto space-y-1 mb-4 bg-black/20 p-3 rounded">
                {installationLog.map((log, index) => (
                  <div key={`log-${index}-${log.slice(0, 10)}`} className="text-gray-300">{log}</div>
                ))}
                {isInstalling && (
                  <div className="text-amber-400 animate-pulse">_</div>
                )}
              </div>
              
              <div className="w-full bg-gray-800/50 rounded-full h-2.5">
                <div 
                  className="bg-amber-500 h-2.5 rounded-full transition-all duration-100" 
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
              <div className="text-right text-xs text-gray-400 mt-1">
                {Math.round(displayProgress)}% Complete
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={isInstalling}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono disabled:opacity-50"
              >
                &lt; Back
              </button>
              
              {installationProgress < 100 ? (
                <button
                  type="button"
                  onClick={handleStartInstallation}
                  disabled={isInstalling}
                  className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono disabled:opacity-50"
                >
                  {isInstalling ? 'Installing...' : 'Start Installation'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
                >
                  Next Step &gt;
                </button>
              )}
            </div>
          </div>
        );
      case OnboardingStep.COMPLETE:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Setup Complete!</h3>
            <p className="text-gray-300">
              Congratulations! Your Nanos World Server has been successfully installed and validated.
              You can now start managing your server from the dashboard.
            </p>
            
            <div className="p-4 bg-green-900/20 rounded-lg mt-4">
              <h4 className="font-mono text-green-400 flex items-center">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-5 w-5 mr-2" 
                  viewBox="0 0 20 20" 
                  fill="currentColor" 
                  role="img"
                  aria-labelledby="installationSummaryTitle"
                >
                  <title id="installationSummaryTitle">Installation completed successfully</title>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Installation Summary
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-gray-300">
                <li>• Server Version: {NANOS_VERSIONS.find(v => v.id === selectedVersion)?.name} (v{NANOS_VERSIONS.find(v => v.id === selectedVersion)?.version})</li>
                <li>• Installation Directory: {NANOS_INSTALL_DIR}</li>
              </ul>
            </div>
            
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={handleCompleteOnboarding}
                className="px-6 py-2 bg-green-600/50 text-green-300 rounded hover:bg-green-600/70 transition-colors font-mono"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  // Progress indicator
  const renderProgressIndicator = () => {
    const steps = [
      { name: 'Welcome', step: OnboardingStep.WELCOME },
      { name: 'Version', step: OnboardingStep.VERSION_SELECT },
      { name: 'Install', step: OnboardingStep.INSTALLATION },
      { name: 'Complete', step: OnboardingStep.COMPLETE }
    ];
    
    return (
      <div className="flex justify-between mb-8">
        {steps.map((step, index) => (
          <div key={`step-${step.step}`} className="flex flex-col items-center relative">
            <div 
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= step.step 
                  ? 'bg-amber-500/50 text-amber-200' 
                  : 'bg-gray-800/50 text-gray-500'
              }`}
            >
              {step.step + 1}
            </div>
            <div className={`text-xs mt-1 font-mono ${
              currentStep >= step.step ? 'text-amber-400' : 'text-gray-500'
            }`}>
              {step.name}
            </div>
            {index < steps.length - 1 && (
              <div className="absolute h-0.5 bg-gray-800/50 w-[calc(100%-2rem)]" 
                   style={{ 
                     left: '2rem', 
                     top: '1rem',
                     zIndex: -1
                   }}>
                <div 
                  className={`h-full ${
                    currentStep > step.step ? 'bg-amber-500/30' : ''
                  }`} 
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="p-6">
      {renderProgressIndicator()}
      {renderStep()}
    </div>
  );
}