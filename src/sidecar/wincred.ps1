param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("read", "write", "delete")]
    [string]$Action,

    [string]$Target = "LegacyGeneric:target=gemini:antigravity",
    [string]$UserName = "antigravity",
    [string]$Base64Payload = ""
)

$TypeDefinition = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinCred {
    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);

    [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] uint flags);

    [DllImport("Advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredDelete(string target, int type, int flags);

    [DllImport("Advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
    public static extern void CredFree(IntPtr cred);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    public static string Read(string target) {
        IntPtr credPtr;
        if (CredRead(target, 1, 0, out credPtr)) {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
            byte[] blob = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, blob, 0, cred.CredentialBlobSize);
            CredFree(credPtr);
            return Encoding.UTF8.GetString(blob);
        }
        return null;
    }

    public static bool Write(string target, string user, string secret) {
        byte[] blob = Encoding.UTF8.GetBytes(secret);
        IntPtr blobPtr = Marshal.AllocHGlobal(blob.Length);
        Marshal.Copy(blob, 0, blobPtr, blob.Length);

        CREDENTIAL cred = new CREDENTIAL();
        cred.Type = 1; // Generic
        cred.TargetName = target;
        cred.UserName = user;
        cred.CredentialBlob = blobPtr;
        cred.CredentialBlobSize = blob.Length;
        cred.Persist = 2; // Local machine

        bool result = CredWrite(ref cred, 0);
        Marshal.FreeHGlobal(blobPtr);
        return result;
    }

    public static bool Delete(string target) {
        return CredDelete(target, 1, 0);
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'WinCred').Type) {
    Add-Type -TypeDefinition $TypeDefinition -ErrorAction SilentlyContinue
}

switch ($Action) {
    "read" {
        $raw = [WinCred]::Read($Target)
        if ($raw) {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
            [System.Convert]::ToBase64String($bytes)
        }
    }
    "write" {
        if (-not $Base64Payload) {
            Write-Error "Base64Payload is required for write"
            exit 1
        }
        $raw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Base64Payload))
        $result = [WinCred]::Write($Target, $UserName, $raw)
        Write-Output $result
    }
    "delete" {
        $result = [WinCred]::Delete($Target)
        Write-Output $result
    }
}
