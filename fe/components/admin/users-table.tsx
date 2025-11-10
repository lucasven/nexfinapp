"use client"

import { useState } from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { UserDetailsDialog } from "./user-details-dialog"

interface UserData {
  userId: string
  email: string
  displayName: string | null
  whatsappNumbersCount: number
  totalTransactions: number
  aiTotalCost: number
  aiDailyLimit: number
  joinedDate: string
}

interface UsersTableProps {
  data: UserData[]
}

export function UsersTable({ data }: UsersTableProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="text-right">WhatsApp #s</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">AI Spend</TableHead>
              <TableHead className="text-right">Daily Limit</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              data.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{user.email}</div>
                      {user.displayName && (
                        <div className="text-sm text-muted-foreground">{user.displayName}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {user.whatsappNumbersCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {user.totalTransactions.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    ${user.aiTotalCost.toFixed(6)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${user.aiDailyLimit.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {new Date(user.joinedDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedUserId(user.userId)}
                    >
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedUserId && (
        <UserDetailsDialog
          userId={selectedUserId}
          open={!!selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </>
  )
}

