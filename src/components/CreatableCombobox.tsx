import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useDynamicColumnOptions } from "@/hooks/useDynamicColumnOptions"
import { useAuth } from "@/contexts/AuthContext"

interface CreatableComboboxProps {
  columnName: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CreatableCombobox({ columnName, value, onChange, placeholder }: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const { companyId } = useAuth()
  const { options, loading } = useDynamicColumnOptions(companyId, columnName)

  const handleSelect = (currentValue: string) => {
    onChange(currentValue)
    setOpen(false)
    setInputValue("")
  }

  const showCreateOption = inputValue.trim() !== "" && !options.some((opt) => opt.toLowerCase() === inputValue.toLowerCase())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? value : <span className="text-muted-foreground">{placeholder || `Pilih atau ketik ${columnName.toLowerCase()}...`}</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" style={{ width: "var(--radix-popover-trigger-width)" }} align="start">
        <Command>
          <CommandInput 
            placeholder={`Cari atau tambah ${columnName.toLowerCase()}...`} 
            value={inputValue} 
            onValueChange={setInputValue} 
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Memuat data..." : showCreateOption ? `Tekan enter untuk buat "${inputValue}"` : "Tidak ada opsi ditemukan."}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={(currentValue) => {
                    // CommandItem lowercases the value by default for matching, 
                    // so we need to use the original option string if they match.
                    const originalValue = options.find(o => o.toLowerCase() === currentValue) || currentValue;
                    handleSelect(originalValue)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
              
              {showCreateOption && (
                <CommandItem
                  value={inputValue}
                  onSelect={() => handleSelect(inputValue.trim())}
                  className="font-medium text-primary"
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Buat "{inputValue.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
