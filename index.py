n = int(input("enter no of row"))

for i in range(1,n+1):
    for s in range((n-i)+1):
        print(" ", end="")
    for j in range(1,(i*2-1)+1):
        print("*", end="")
    for s in range((n-i)+1):
        print(" ", end="")
    for s in range((n-i)+1):
        print(" ", end="")
    for j in range(1,(i*2-1)+1):
        print("*", end="")
    print()

# for i in range(n+1, 0, -1):
#     for s in range((n-i)+1):
#         print(" ", end="")
#     for j in range(i):
#         print("*", end="")
#     print()
